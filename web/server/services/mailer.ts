import nodemailer, { type Transporter } from 'nodemailer'
import { assertNoCrlf } from '@/lib/escape'
import type { SmtpCreds } from './credentials'
import { getSmtpFor } from './credentials'

// Cache a transport per credentials fingerprint so we don't reconnect on
// every send. The cache lives for the process lifetime — fine on long-running
// nodes and acceptable on serverless cold starts.
const cache = new Map<string, Transporter>()

function transportFor(c: SmtpCreds): Transporter {
  if (!c.user || !c.pass) throw new Error('SMTP not configured (Settings → Email)')
  const key = `${c.host}:${c.port}:${c.user}`
  let t = cache.get(key)
  if (t) return t
  t = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  })
  cache.set(key, t)
  return t
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send via SMTP. Pass a `userId` to use that user's per-user SMTP creds
 * (with env as fallback). The worker passes a userId; ad-hoc sends from
 * the diagnostic page also pass it. Headers are CR/LF-guarded.
 */
export async function sendMail(m: OutgoingEmail, userId?: string) {
  assertNoCrlf('to', m.to)
  assertNoCrlf('subject', m.subject)
  if (!userId) {
    // Backwards-compat path: env-only. Used by the legacy scheduler tick
    // path before per-user creds rolled in.
    const env = await import('@/lib/env').then((m) => m.env)
    if (!env.SMTP_USER || !env.SMTP_PASS) throw new Error('SMTP not configured')
    const t = transportFor({
      host: env.SMTP_HOST, port: env.SMTP_PORT,
      user: env.SMTP_USER, pass: env.SMTP_PASS,
      from: env.EMAIL_FROM ?? env.SMTP_USER, source: 'env',
    })
    return t.sendMail({ from: env.EMAIL_FROM ?? env.SMTP_USER, to: m.to, subject: m.subject, html: m.html, text: m.text })
  }
  const creds = await getSmtpFor(userId)
  if (creds.source === 'none') throw new Error('SMTP not configured (Settings → Email)')
  const t = transportFor(creds)
  return t.sendMail({ from: creds.from, to: m.to, subject: m.subject, html: m.html, text: m.text })
}

export async function verifySmtpFor(userId: string): Promise<{ ok: boolean; source: string; error?: string }> {
  try {
    const c = await getSmtpFor(userId)
    if (c.source === 'none') return { ok: false, source: 'none', error: 'Not configured' }
    await transportFor(c).verify()
    return { ok: true, source: c.source }
  } catch (e) {
    return { ok: false, source: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}
