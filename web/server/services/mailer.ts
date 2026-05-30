import nodemailer, { type Transporter } from 'nodemailer'
import { assertNoCrlf } from '@/lib/escape'
import { env } from '@/lib/env'

let transport: Transporter | null = null
function smtp(): Transporter {
  if (transport) return transport
  if (!env.SMTP_USER || !env.SMTP_PASS) throw new Error('SMTP not configured')
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  return transport
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendMail(m: OutgoingEmail) {
  assertNoCrlf('to', m.to)
  assertNoCrlf('subject', m.subject)
  return smtp().sendMail({
    from: env.EMAIL_FROM ?? env.SMTP_USER,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
  })
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    await smtp().verify()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
