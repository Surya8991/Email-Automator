import { db } from '@/server/db/client'
import { emailLog, events } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyClick } from '@/server/services/tracking'
import { dispatchAsync } from '@/server/services/webhooks'
import { clientKey, rateLimit } from '@/lib/rate-limit'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const eid = Number(url.searchParams.get('eid'))
  const target = String(url.searchParams.get('u') ?? '')
  const token = String(url.searchParams.get('t') ?? '')
  // SECURITY: only follow the link when the HMAC signature verifies. The
  // earlier behaviour of redirecting even on signature failure made this
  // endpoint an open redirect — anyone could craft
  //   /api/track/click?u=https://phish.example&t=garbage
  // and the app's domain would launder the destination. Now bad / missing
  // signatures bounce to the app root.
  const verified = Number.isFinite(eid) && target && verifyClick(eid, target, token)
  if (!verified) {
    // Build absolute URL for the redirect — Response.redirect requires it.
    const home = new URL('/', url).toString()
    return Response.redirect(home, 302)
  }
  // 60 clicks / min / IP — well above legitimate use (a human can't click
  // a link 60 times a minute), tight enough that a script can't inflate
  // click counts. We still follow the redirect (recipient navigation must
  // not break); we just skip the event write past the threshold.
  const allowed = rateLimit(clientKey(req, 'track-click'), 60, 60_000)
  if (allowed) {
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, eid))
    if (row) {
      await db.insert(events).values({
        userId: row.userId,
        contactId: row.contactId ?? null,
        kind: 'click',
        meta: JSON.stringify({ url: target }),
      })
      dispatchAsync(row.userId, 'click', { url: target, emailLogId: row.id })
    }
  }
  // Belt-and-braces: only allow http(s) targets even on a verified link,
  // so a future bug in signing can't redirect to javascript: or data:.
  const safe = /^https?:\/\//i.test(target) ? target : new URL('/', url).toString()
  return Response.redirect(safe, 302)
}
