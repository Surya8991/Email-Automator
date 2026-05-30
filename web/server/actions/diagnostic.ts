'use server'
import { promises as dns } from 'node:dns'
import { requireUser } from '@/auth'
import { verifySmtp, sendMail } from '@/server/services/mailer'
import { env } from '@/lib/env'

export interface DiagResult { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }

export async function runDiagnosticsAction(): Promise<{ results: DiagResult[] }> {
  const u = await requireUser()
  const r: DiagResult[] = []
  const pass = (name: string, detail = '') => r.push({ name, status: 'pass', detail })
  const warn = (name: string, detail: string) => r.push({ name, status: 'warn', detail })
  const fail = (name: string, detail: string) => r.push({ name, status: 'fail', detail })

  // SMTP
  if (env.SMTP_USER && env.SMTP_PASS) {
    const v = await verifySmtp()
    if (v.ok) pass('SMTP', `Connected as ${env.SMTP_USER}`)
    else warn('SMTP', v.error ?? 'verify failed')
  } else warn('SMTP', 'Not configured (set SMTP_USER and SMTP_PASS)')

  // Groq
  if (env.GROQ_API_KEY) pass('AI (Groq)', `Model ${env.GROQ_MODEL}`)
  else warn('AI (Groq)', 'GROQ_API_KEY not set — AI assist disabled')

  // OAuth
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) pass('Google OAuth', 'Configured')
  else warn('Google OAuth', 'Not configured — magic-link only')

  // DNS / SPF / DMARC for the SMTP sender domain
  const sender = env.SMTP_USER
  if (sender && sender.includes('@')) {
    const domain = sender.split('@')[1]!.toLowerCase()
    try {
      const txts = await dns.resolveTxt(domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      if (/v=spf1/i.test(flat)) pass('SPF', flat.match(/v=spf1[^|]*/i)?.[0] ?? '')
      else warn('SPF', `No SPF record on ${domain}`)
    } catch { warn('SPF', `No TXT records on ${domain}`) }

    try {
      const txts = await dns.resolveTxt('_dmarc.' + domain)
      const flat = txts.map((t) => t.join('')).join(' | ')
      const rec = flat.match(/v=DMARC1[^|]*/i)?.[0]
      if (rec) {
        const policy = rec.match(/\bp\s*=\s*([a-z]+)/i)?.[1]?.toLowerCase()
        if (policy === 'none') warn('DMARC', `Policy is p=none on ${domain}; consider quarantine/reject`)
        else pass('DMARC', rec)
      } else warn('DMARC', `No DMARC record at _dmarc.${domain}`)
    } catch { warn('DMARC', `No _dmarc.${domain} TXT records`) }
  } else warn('DNS', 'No sender domain to check')

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
    })
    return { ok: true, to: u.email }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Send failed' }
  }
}
