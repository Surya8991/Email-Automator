import { db } from '@/server/db/client'
import { emailLog, events } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyClick } from '@/server/services/tracking'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const eid = Number(url.searchParams.get('eid'))
  const target = String(url.searchParams.get('u') ?? '')
  const token = String(url.searchParams.get('t') ?? '')
  // Always redirect — even on signature failure — so a leaked link still
  // works for the recipient. Just don't credit the click event.
  if (Number.isFinite(eid) && target && verifyClick(eid, target, token)) {
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, eid))
    if (row) {
      await db.insert(events).values({
        userId: row.userId,
        contactId: row.contactId ?? null,
        kind: 'click',
        meta: JSON.stringify({ url: target }),
      })
    }
  }
  // Only allow http(s) targets — never internal paths or javascript: URLs.
  const safe = /^https?:\/\//i.test(target) ? target : '/'
  return Response.redirect(safe, 302)
}
