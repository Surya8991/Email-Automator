'use server'
import { promises as dns } from 'node:dns'
import { requireUser } from '@/auth'
import { verifySmtpFor, sendMail } from '@/server/services/mailer'
import { getAiFor, getSmtpFor } from '@/server/services/credentials'
import { env, adminEmails } from '@/lib/env'
import { actionError } from '@/lib/action-error'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { sql } from 'drizzle-orm'

export type DiagGroup = 'connectivity' | 'deliverability' | 'background' | 'admin'
export interface DiagResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  group?: DiagGroup
  /** Human-readable remediation step shown when the user expands the row. */
  remediation?: string
}

// Major mailbox providers — the user can't change their DMARC/SPF policy
// because they don't own the domain. Flagging "p=none on gmail.com" is a
// false positive that scares people; suppress it for these.
const PROVIDER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'zoho.com', 'fastmail.com',
])

/**
 * mode='quick' skips DNS lookups (MX/SPF/DMARC). Quick is the right
 * choice when you only need to know "did SMTP/AI/cron break since last
 * deploy"; full adds deliverability posture. Default is full to match
 * pre-change behaviour.
 */
export async function runDiagnosticsAction(opts: { mode?: 'quick' | 'full' } = {}): Promise<{ results: DiagResult[] }> {
  const mode = opts.mode === 'quick' ? 'quick' : 'full'
  const u = await requireUser()
  const r: DiagResult[] = []
  const pass = (name: string, detail = '', group: DiagGroup = 'connectivity') =>
    r.push({ name, status: 'pass', detail, group })
  const warn = (name: string, detail: string, group: DiagGroup = 'connectivity', remediation?: string) =>
    r.push({ name, status: 'warn', detail, group, remediation })

  // SMTP — checks user creds, then env fallback
  const smtp = await getSmtpFor(u.id)
  if (smtp.source !== 'none') {
    const v = await verifySmtpFor(u.id)
    if (v.ok) pass('SMTP', `Connected as ${smtp.user} (${smtp.source === 'user' ? 'per-user' : 'env'})`)
    else warn('SMTP', v.error ?? 'verify failed', 'connectivity',
      'Open Settings → Email. Verify the server, port, and the App Password. Gmail App Passwords are at https://myaccount.google.com/apppasswords.')
  } else warn('SMTP', 'Not configured — Settings → Email', 'connectivity',
    'You must configure SMTP before any send works. Settings → Email lets you set it per-user; admins can set defaults via SMTP_HOST/SMTP_USER/SMTP_PASS env vars.')

  // Groq
  const ai = await getAiFor(u.id)
  if (ai.source !== 'none') pass('AI (Groq)', `Model ${ai.model} (${ai.source === 'user' ? 'per-user' : 'env'})`)
  else warn('AI (Groq)', 'Not configured — Settings → AI', 'connectivity',
    'AI features (suggest subjects, improve drafts, company auto-fill) need a Groq key. Free tier at https://console.groq.com. Set per-user in Settings → AI, or admin-wide via GROQ_API_KEY env.')

  // OAuth
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) pass('Google OAuth', 'Configured')
  else warn('Google OAuth', 'Not configured (.env only, requires restart)', 'connectivity',
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel env vars and redeploy. The "Continue with Google" button only renders when both are present.')

  // DNS / SPF / DMARC for the resolved sender domain.
  // Skipped in quick mode — DNS lookups are the slowest step (3 × ~100ms
  // each) and not informative when you just deployed and want to know
  // SMTP/cron still work.
  const sender = smtp.user
  if (mode === 'full' && sender && sender.includes('@')) {
    const domain = sender.split('@')[1]!.toLowerCase()
    const isProvider = PROVIDER_DOMAINS.has(domain)

    // MX records — if there are none, mail to this domain bounces. This
    // is THE most foundational deliverability check: without an MX,
    // SPF/DMARC posture doesn't matter because the domain can't receive
    // (and Gmail uses can-it-receive as a signal for outbound trust too).
    try {
      const mx = await dns.resolveMx(domain)
      if (mx.length === 0) warn('MX', `No MX records on ${domain} — mail to this domain will bounce`, 'deliverability',
        `Add at least one MX record to ${domain}'s DNS. If you don't run mail for the domain, send from a domain you do.`)
      else {
        const sorted = mx.sort((a, b) => a.priority - b.priority)
        const primary = sorted[0]!
        pass('MX', `${mx.length} record(s); primary ${primary.exchange} (priority ${primary.priority})`, 'deliverability')
      }
    } catch (e) {
      // ENODATA / ENOTFOUND etc. — DNS resolver couldn't get an MX answer.
      const msg = e instanceof Error ? (e as NodeJS.ErrnoException).code ?? e.message : 'lookup failed'
      warn('MX', `Lookup failed for ${domain}: ${msg}`, 'deliverability')
    }

    try {
      const txts = await dns.resolveTxt(domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      if (/v=spf1/i.test(flat)) pass('SPF', flat.match(/v=spf1[^|]*/i)?.[0] ?? '', 'deliverability')
      else if (isProvider) pass('SPF', `${domain} is a mailbox provider — SPF is managed by them`, 'deliverability')
      else warn('SPF', `No SPF record on ${domain}`, 'deliverability',
        `Add a TXT record at ${domain}: "v=spf1 include:_spf.google.com ~all" (or your provider's). Without SPF, Gmail/Outlook may bin your mail.`)
    } catch {
      if (isProvider) pass('SPF', `${domain} is a mailbox provider — DNS managed by them`, 'deliverability')
      else warn('SPF', `No TXT records on ${domain}`, 'deliverability')
    }

    try {
      const txts = await dns.resolveTxt('_dmarc.' + domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      const rec = flat.match(/v=DMARC1[^|]*/i)?.[0]
      if (rec) {
        const policy = rec.match(/\bp\s*=\s*([a-z]+)/i)?.[1]?.toLowerCase()
        if (policy === 'none' && isProvider) {
          pass('DMARC', `${rec} (${domain} is a mailbox provider — policy is set by them)`, 'deliverability')
        } else if (policy === 'none') {
          warn('DMARC', `Policy is p=none on ${domain}; consider quarantine/reject for stronger anti-spoof`, 'deliverability',
            `Upgrade to "p=quarantine" or "p=reject" once you've watched DMARC reports for a few weeks and confirmed no legit mail is failing.`)
        } else pass('DMARC', rec, 'deliverability')
      } else if (isProvider) {
        pass('DMARC', `${domain} is a mailbox provider — DMARC is managed by them`, 'deliverability')
      } else warn('DMARC', `No DMARC record at _dmarc.${domain}`, 'deliverability',
        `Add TXT at _dmarc.${domain}: "v=DMARC1; p=none; rua=mailto:reports@${domain}". Start with p=none to monitor, then tighten.`)
    } catch {
      if (isProvider) pass('DMARC', `${domain} is a mailbox provider — DMARC managed by them`, 'deliverability')
      else warn('DMARC', `No _dmarc.${domain} TXT records`, 'deliverability')
    }
  } else if (mode === 'full') warn('DNS', 'No sender domain to check', 'deliverability')

  // CRON_SECRET — required for the /api/cron/tick route to accept requests
  // from Vercel cron. Missing it is the single most common reason "sends
  // stopped after deploy" — surface it loudly here so the operator catches
  // it before a campaign goes silent.
  if (env.CRON_SECRET && env.CRON_SECRET.length >= 16) pass('CRON_SECRET', `set (${env.CRON_SECRET.length} chars)`, 'background')
  else if (env.CRON_SECRET) warn('CRON_SECRET', 'set but suspiciously short (<16 chars) — use a long random value', 'background',
    'Run `openssl rand -base64 32` and replace CRON_SECRET in both Vercel env and GitHub Actions secrets with the new value.')
  else warn('CRON_SECRET', 'unset — Vercel cron will be rejected; sends won\'t fire', 'background',
    'Set CRON_SECRET (≥16 chars, random) in Vercel env. Same value in GitHub Actions secrets if you use GitHub-triggered cron.')

  // libsql reachability — a 1-row probe against the configured DB. Errors
  // here usually mean a bad TURSO_AUTH_TOKEN or an unreachable URL.
  try {
    await db.select({ n: sql<number>`1` }).from(users).limit(1)
    const dbKind = env.DATABASE_URL.startsWith('libsql:') ? 'libsql (Turso)' : 'sqlite file'
    pass('Database', `${dbKind} reachable`, 'connectivity')
  } catch (e) {
    warn('Database', e instanceof Error ? e.message.slice(0, 200) : 'select failed', 'connectivity',
      'Verify DATABASE_URL and TURSO_AUTH_TOKEN in Vercel env. If recently rotated, redeploy. Check Turso dashboard for outages.')
  }

  // ADMIN_EMAILS — operators commonly forget to set this on first deploy.
  // Without it /admin and /diagnostic redirect; the operator silently has
  // no access. A loud warn beats a silent redirect.
  if (adminEmails.length === 0) warn('ADMIN_EMAILS', 'unset — no admins on this instance; /admin and /diagnostic redirect', 'admin',
    'Set ADMIN_EMAILS to a comma-separated list of admin addresses in Vercel env, e.g. "you@x.com,colleague@x.com". Lowercased. Redeploy.')
  else pass('ADMIN_EMAILS', `${adminEmails.length} configured`, 'admin')

  pass('User', `Signed in as ${u.email}`, 'admin')
  return { results: r }
}

export async function sendSmtpTestAction() {
  const u = await requireUser()
  try {
    await sendMail({
      to: u.email,
      subject: 'SMTP test — Email Automator',
      html: '<p>This is a test from Email Automator. If you got this, SMTP works.</p>',
      text: 'This is a test from Email Automator. If you got this, SMTP works.',
    }, u.id)
    return { ok: true, to: u.email }
  } catch (e) {
    return actionError(e, 'Send failed')
  }
}
