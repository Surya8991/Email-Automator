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

export interface DiagResult { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }

// Major mailbox providers — the user can't change their DMARC/SPF policy
// because they don't own the domain. Flagging "p=none on gmail.com" is a
// false positive that scares people; suppress it for these.
const PROVIDER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'zoho.com', 'fastmail.com',
])

export async function runDiagnosticsAction(): Promise<{ results: DiagResult[] }> {
  const u = await requireUser()
  const r: DiagResult[] = []
  const pass = (name: string, detail = '') => r.push({ name, status: 'pass', detail })
  const warn = (name: string, detail: string) => r.push({ name, status: 'warn', detail })

  // SMTP — checks user creds, then env fallback
  const smtp = await getSmtpFor(u.id)
  if (smtp.source !== 'none') {
    const v = await verifySmtpFor(u.id)
    if (v.ok) pass('SMTP', `Connected as ${smtp.user} (${smtp.source === 'user' ? 'per-user' : 'env'})`)
    else warn('SMTP', v.error ?? 'verify failed')
  } else warn('SMTP', 'Not configured — Settings → Email')

  // Groq
  const ai = await getAiFor(u.id)
  if (ai.source !== 'none') pass('AI (Groq)', `Model ${ai.model} (${ai.source === 'user' ? 'per-user' : 'env'})`)
  else warn('AI (Groq)', 'Not configured — Settings → AI')

  // OAuth
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) pass('Google OAuth', 'Configured')
  else warn('Google OAuth', 'Not configured (.env only, requires restart)')

  // DNS / SPF / DMARC for the resolved sender domain
  const sender = smtp.user
  if (sender && sender.includes('@')) {
    const domain = sender.split('@')[1]!.toLowerCase()
    const isProvider = PROVIDER_DOMAINS.has(domain)

    // MX records — if there are none, mail to this domain bounces. This
    // is THE most foundational deliverability check: without an MX,
    // SPF/DMARC posture doesn't matter because the domain can't receive
    // (and Gmail uses can-it-receive as a signal for outbound trust too).
    try {
      const mx = await dns.resolveMx(domain)
      if (mx.length === 0) warn('MX', `No MX records on ${domain} — mail to this domain will bounce`)
      else {
        const sorted = mx.sort((a, b) => a.priority - b.priority)
        const primary = sorted[0]!
        pass('MX', `${mx.length} record(s); primary ${primary.exchange} (priority ${primary.priority})`)
      }
    } catch (e) {
      // ENODATA / ENOTFOUND etc. — DNS resolver couldn't get an MX answer.
      const msg = e instanceof Error ? (e as NodeJS.ErrnoException).code ?? e.message : 'lookup failed'
      warn('MX', `Lookup failed for ${domain}: ${msg}`)
    }

    try {
      const txts = await dns.resolveTxt(domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      if (/v=spf1/i.test(flat)) pass('SPF', flat.match(/v=spf1[^|]*/i)?.[0] ?? '')
      else if (isProvider) pass('SPF', `${domain} is a mailbox provider — SPF is managed by them`)
      else warn('SPF', `No SPF record on ${domain}`)
    } catch {
      if (isProvider) pass('SPF', `${domain} is a mailbox provider — DNS managed by them`)
      else warn('SPF', `No TXT records on ${domain}`)
    }

    try {
      const txts = await dns.resolveTxt('_dmarc.' + domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      const rec = flat.match(/v=DMARC1[^|]*/i)?.[0]
      if (rec) {
        const policy = rec.match(/\bp\s*=\s*([a-z]+)/i)?.[1]?.toLowerCase()
        if (policy === 'none' && isProvider) {
          // gmail.com etc. — you don't own the domain, you can't change its
          // policy, and it's not your problem. Surface as pass.
          pass('DMARC', `${rec} (${domain} is a mailbox provider — policy is set by them)`)
        } else if (policy === 'none') {
          warn('DMARC', `Policy is p=none on ${domain}; consider quarantine/reject for stronger anti-spoof`)
        } else pass('DMARC', rec)
      } else if (isProvider) {
        pass('DMARC', `${domain} is a mailbox provider — DMARC is managed by them`)
      } else warn('DMARC', `No DMARC record at _dmarc.${domain}`)
    } catch {
      if (isProvider) pass('DMARC', `${domain} is a mailbox provider — DMARC managed by them`)
      else warn('DMARC', `No _dmarc.${domain} TXT records`)
    }
  } else warn('DNS', 'No sender domain to check')

  // CRON_SECRET — required for the /api/cron/tick route to accept requests
  // from Vercel cron. Missing it is the single most common reason "sends
  // stopped after deploy" — surface it loudly here so the operator catches
  // it before a campaign goes silent.
  if (env.CRON_SECRET && env.CRON_SECRET.length >= 16) pass('CRON_SECRET', `set (${env.CRON_SECRET.length} chars)`)
  else if (env.CRON_SECRET) warn('CRON_SECRET', 'set but suspiciously short (<16 chars) — use a long random value')
  else warn('CRON_SECRET', 'unset — Vercel cron will be rejected; sends won\'t fire')

  // libsql reachability — a 1-row probe against the configured DB. Errors
  // here usually mean a bad TURSO_AUTH_TOKEN or an unreachable URL.
  try {
    await db.select({ n: sql<number>`1` }).from(users).limit(1)
    const dbKind = env.DATABASE_URL.startsWith('libsql:') ? 'libsql (Turso)' : 'sqlite file'
    pass('Database', `${dbKind} reachable`)
  } catch (e) {
    warn('Database', e instanceof Error ? e.message.slice(0, 200) : 'select failed')
  }

  // ADMIN_EMAILS — operators commonly forget to set this on first deploy.
  // Without it /admin and /diagnostic redirect; the operator silently has
  // no access. A loud warn beats a silent redirect.
  if (adminEmails.length === 0) warn('ADMIN_EMAILS', 'unset — no admins on this instance; /admin and /diagnostic redirect')
  else pass('ADMIN_EMAILS', `${adminEmails.length} configured`)

  pass('User', `Signed in as ${u.email}`)
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
