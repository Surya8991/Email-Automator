import { db } from '@/server/db/client'
import { blocklist } from '@/server/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { verifyToken } from '@/server/services/unsubscribe'
import { clientKey, rateLimit } from '@/lib/rate-limit'

// Mail-provider link scanners (Gmail link preview, Outlook safelinks,
// Apple Mail anti-phishing, Microsoft Defender) fetch URLs from shared
// egress IPs that hit any single endpoint thousands of times per minute
// across all senders. A 10/min/IP cap would trip them and break RFC 8058
// one-click compliance signal. So we split:
//   GET  (human confirmation page): tighter — 30/min/IP
//   POST (RFC 8058 one-click):      generous — 240/min/IP
// Token forgery is already gated by the HMAC verifyToken check on every
// hit; rate limiting here only protects against blind enumeration.
async function handle(req: Request, method: 'GET' | 'POST'): Promise<{ email: string } | Response> {
  const cap = method === 'POST' ? 240 : 30
  if (!rateLimit(clientKey(req, `unsub-${method}`), cap, 60_000)) {
    return new Response('Too many requests', { status: 429 })
  }
  const url = new URL(req.url)
  const email = String(url.searchParams.get('e') ?? '').toLowerCase().trim()
  const token = String(url.searchParams.get('t') ?? '')
  if (!email || !verifyToken(email, token)) {
    return new Response('Invalid or expired unsubscribe link.', { status: 400 })
  }
  // Global suppression — null userId means "applies to every sender".
  const existing = await db.select().from(blocklist)
    .where(and(isNull(blocklist.userId), eq(blocklist.pattern, email), eq(blocklist.type, 'email')))
  if (existing.length === 0) {
    await db.insert(blocklist).values({ userId: null, pattern: email, type: 'email' })
  }
  return { email }
}

// RFC 8058 one-click POST — mail clients fire this with no UI.
export async function POST(req: Request) {
  const r = await handle(req, 'POST')
  if (r instanceof Response) return r
  return new Response('Unsubscribed.', { status: 200 })
}

// Human-facing GET — friendly confirmation page.
export async function GET(req: Request) {
  const r = await handle(req, 'GET')
  if (r instanceof Response) return r
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;text-align:center;color:#333"><h2>You're unsubscribed</h2><p>You will no longer receive emails. You can close this page.</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
