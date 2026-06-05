'use server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
import { rateLimit } from '@/lib/rate-limit'
import { env } from '@/lib/env'
import { signCookieValue, verifyCookieValue } from '@/lib/cookies'

// Public contact form. No auth, runs from /contact. Three lines of defense:
//   1. Honeypot — bots fill the hidden `_hp` field; humans never see it.
//      Submissions with a non-empty honeypot succeed-pretend (200 OK,
//      nothing written) so scrapers can't tell from response codes.
//   2. Rate limit 5/hour/IP via the existing clientKey + in-memory bucket.
//      Returns a structured error the form can render.
//   3. Zod input validation, then a sanitize() pass to strip control chars
//      so a malicious message can't inject fake log fields.
//
// On success: writes a `public.contact_form` row to auditLog so an
// authenticated admin sees it at /audit?scope=all. Optionally forwards
// to EMAIL_FROM via the existing sendMail() — best-effort, never blocks
// the success response.

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(100, 'Name too long'),
  email: z.string().trim().email('Valid email required').max(200),
  subject: z.string().trim().min(1, 'Subject required').max(120),
  message: z.string().trim().min(10, 'Message must be at least 10 chars').max(2000),
  // Hidden honeypot — must be empty.
  _hp: z.string().max(200).optional(),
  // Signed render-time token. Submission must arrive >MIN_FILL_MS and
  // <MAX_FILL_MS after the form was rendered. Catches headless bots
  // that read computed styles + skip the honeypot but submit instantly.
  _t: z.string().min(1).max(400).optional(),
})

const MIN_FILL_MS = 2_000          // Humans take more than 2 seconds to fill a form.
const MAX_FILL_MS = 30 * 60_000    // 30 minutes — keeps abandoned tabs from clogging the bucket.

// Strip control chars + clamp length so a crafted value can't smuggle
// fake `reason=success` fragments into the audit detail string.
function sanitize(v: string, max = 400): string {
  return v.replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, max)
}

export interface ContactInput {
  name: string
  email: string
  subject: string
  message: string
  _hp?: string
  _t?: string
}

// Helper exported for the client form: mint a signed render-time stamp
// the client embeds in the hidden _t field. We verify on submit that
// the elapsed time is in [MIN_FILL_MS, MAX_FILL_MS]. Signed with
// AUTH_SECRET via lib/cookies so the value can't be forged.
export async function mintFormTokenAction(): Promise<string> {
  return signCookieValue(String(Date.now()))
}

export async function submitContactAction(input: ContactInput) {
  // Resolve the client IP. We DO NOT fall back to a shared 'anon' bucket
  // — that would let one bot DoS the form for every visitor behind a
  // misconfigured proxy. Empty IP routes through the cookie token below.
  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || h.get('x-real-ip') || ''

  const parsed = ContactSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  // Honeypot: succeed-pretend so bots can't tell their submission was discarded.
  if (parsed.data._hp && parsed.data._hp.trim() !== '') {
    return { ok: true as const, message: 'Thanks — we got it.' }
  }

  // Time-to-fill check. Headless bots that skip the honeypot still submit
  // far faster than humans; conversely the token expires after 30min so
  // a stale tab can't be replayed forever. Missing token also fails —
  // it's required for any non-bot submit.
  const stamp = parsed.data._t ? Number(verifyCookieValue(parsed.data._t)) : NaN
  const elapsed = Number.isFinite(stamp) ? Date.now() - stamp : -1
  if (elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) {
    // Same succeed-pretend strategy as the honeypot — bots can't tell.
    return { ok: true as const, message: 'Thanks — we got it.' }
  }

  // Build a stable rate-limit bucket key. Prefer real IP; when none is
  // available (server-to-server or local without a proxy), require a
  // signed `ea_contact` cookie token issued earlier in the session so
  // we still have a per-client bucket. This avoids the shared 'anon'
  // pool where one attacker locks out everyone else.
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  let bucketKey: string
  if (ip) {
    bucketKey = `contact:ip:${ip}`
  } else {
    const existing = verifyCookieValue(jar.get('ea_contact')?.value)
    if (existing) {
      bucketKey = `contact:tok:${existing}`
    } else {
      // First-time visitor without an IP — mint a per-session token,
      // accept this single submission, and gate further ones on the
      // token. Token is HMAC-signed with AUTH_SECRET (can't be forged).
      const tok = crypto.randomUUID()
      jar.set({
        name: 'ea_contact',
        value: signCookieValue(tok),
        httpOnly: true, sameSite: 'strict', path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
      })
      bucketKey = `contact:tok:${tok}`
    }
  }

  // 5/hour. Bucket key is either per-IP or per-signed-token — never a
  // shared global pool, so one bot can't DoS the form for everyone.
  if (!rateLimit(bucketKey, 5, 60 * 60_000)) {
    return { error: 'Too many submissions from your network. Please try again in an hour.' }
  }

  const { name, email, subject, message } = parsed.data

  // Audit row — admins see it at /audit?scope=all. Detail is JSON-encoded
  // so a user-supplied name like `Jane" reason="success` can't escape
  // out and inject fake fields into the rest of the string. Control-char
  // strip via sanitize() runs first to drop CRLF before JSON encoding.
  try {
    const detail = JSON.stringify({
      name: sanitize(name, 100),
      email: sanitize(email, 200),
      subject: sanitize(subject, 120),
      len: message.length,
    })
    await db.insert(auditLog).values({
      userId: null,
      action: 'public.contact_form',
      detail,
      ip,
    })
  } catch (e) {
    console.error('[contact] auditLog insert failed:', e)
  }

  // Best-effort SMTP forward. Recipient is hard-coded to env.EMAIL_FROM —
  // a public endpoint must NEVER forward to a user-supplied address or it
  // becomes a spam relay. Failure is silent: the user sees success either
  // way, so a missing/broken SMTP doesn't break the form.
  if (env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM) {
    try {
      const { sendMail } = await import('@/server/services/mailer')
      const html =
        `<p><strong>From:</strong> ${sanitize(name)} &lt;${sanitize(email)}&gt;</p>` +
        `<p><strong>Subject:</strong> ${sanitize(subject)}</p>` +
        `<hr>` +
        `<pre style="white-space:pre-wrap;font-family:system-ui">${sanitize(message, 2000)}</pre>` +
        `<hr>` +
        `<p style="color:#888;font-size:12px">Sent from the /contact form on ${env.APP_URL}. IP: ${sanitize(ip, 60)}</p>`
      await sendMail({
        to: env.EMAIL_FROM,
        subject: `[Contact] ${sanitize(subject, 80)}`,
        html,
      })
    } catch (e) {
      console.error('[contact] sendMail failed (non-fatal):', e)
    }
  }

  return { ok: true as const, message: "Thanks — we'll get back to you soon." }
}
