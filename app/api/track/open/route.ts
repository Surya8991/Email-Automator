import { db } from '@/server/db/client'
import { emailLog, events } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyOpen } from '@/server/services/tracking'
import { dispatchAsync } from '@/server/services/webhooks'
import { clientKey, rateLimit } from '@/lib/rate-limit'

// 1×1 transparent GIF — universally rendered, no decoding errors.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: Request) {
  const url = new URL(req.url)
  const eid = Number(url.searchParams.get('eid'))
  const token = String(url.searchParams.get('t') ?? '')
  // 60 opens / min / IP — generous for legitimate inline-image renders
  // (a single email rendered once = 1 hit), tight enough to stop a script
  // from inflating open stats by tens of thousands per second. We always
  // serve the GIF (email clients shouldn't see 429); we just skip the
  // event write when over the limit so stats stay honest.
  const allowed = rateLimit(clientKey(req, 'track-open'), 60, 60_000)
  if (allowed && Number.isFinite(eid) && verifyOpen(eid, token)) {
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, eid))
    if (row) {
      await db.insert(events).values({
        userId: row.userId,
        contactId: row.contactId ?? null,
        kind: 'open',
        meta: JSON.stringify({ subject: row.subject }),
      })
      dispatchAsync(row.userId, 'open', { subject: row.subject, emailLogId: row.id })
    }
  }
  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Content-Length': String(GIF.length),
    },
  })
}
