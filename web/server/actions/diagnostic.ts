'use server'
import { promises as dns } from 'node:dns'
import { requireUser } from '@/auth'
import { verifySmtpFor, sendMail } from '@/server/services/mailer'
import { getAiFor, getSmtpFor } from '@/server/services/credentials'
import { env } from '@/lib/env'

export interface DiagResult { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }

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
    }, u.id)
    return { ok: true, to: u.email }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Send failed' }
  }
}
