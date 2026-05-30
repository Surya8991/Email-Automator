import { db } from '@/server/db/client'
import { blocklist } from '@/server/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { verifyToken } from '@/server/services/unsubscribe'

async function handle(req: Request): Promise<{ email: string } | Response> {
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
  const r = await handle(req)
  if (r instanceof Response) return r
  return new Response('Unsubscribed.', { status: 200 })
}

// Human-facing GET — friendly confirmation page.
export async function GET(req: Request) {
  const r = await handle(req)
  if (r instanceof Response) return r
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;text-align:center;color:#333"><h2>You're unsubscribed</h2><p>You will no longer receive emails. You can close this page.</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
