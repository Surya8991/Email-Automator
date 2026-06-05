// Streaming CSV export of all users — admin-only. Mirrors the audit-export
// streaming pattern: pages 1000 rows at a time keyed by id so memory stays
// bounded even when the user table grows past 100k rows.
import { and, asc, gt, eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/server/db/client'
import { users, contacts, drafts, events, settings, auditLog } from '@/server/db/schema'
import { adminEmails } from '@/lib/env'
import { formatDate, APP_TZ } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { csvCell, csvResponse, streamCsv } from '@/lib/csv-stream'

const log = logger.child({ component: 'admin-users-export' })

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

export async function GET() {
  const session = await auth()
  const email = (session?.user as { email?: string } | undefined)?.email?.toLowerCase() ?? ''
  if (!email || !adminEmails.includes(email)) {
    return new Response('Unauthorized', { status: 401 })
  }
  // Audit the export — this is admin-visible PII (all user emails).
  try {
    const adminId = (session!.user as { id?: string }).id ?? ''
    await db.insert(auditLog).values({ userId: adminId, action: 'admin.users_export', detail: '', ip: '' })
  } catch (err) { log.warn({ err }, 'audit insert failed') }

  const header = 'id,email,name,created_at,contacts,drafts_pending,events,suspended\n'
  const stream = streamCsv<string>({
    header,
    initialCursor: '',
    fetchPage: async (cursor) => {
      const where = cursor ? gt(users.id, cursor) : undefined
      const rows = await (where
        ? db.select().from(users).where(where).orderBy(asc(users.id)).limit(PAGE_SIZE)
        : db.select().from(users).orderBy(asc(users.id)).limit(PAGE_SIZE))
      if (rows.length === 0) return { rows: [], nextCursor: cursor, done: true }

      // Compute per-user metrics in one round trip per page rather than per row.
      const ids = rows.map((r) => r.id)
      const inClause = sql.join(ids.map((id) => sql`${id}`), sql`, `)
      const [contactRows, draftRows, eventRows, suspRows] = await Promise.all([
        db.select({ uid: contacts.userId, n: sql<number>`COUNT(*)` })
          .from(contacts).where(sql`${contacts.userId} IN (${inClause})`).groupBy(contacts.userId),
        db.select({ uid: drafts.userId, n: sql<number>`COUNT(*)` })
          .from(drafts).where(and(sql`${drafts.userId} IN (${inClause})`, eq(drafts.status, 'draft')))
          .groupBy(drafts.userId),
        db.select({ uid: events.userId, n: sql<number>`COUNT(*)` })
          .from(events).where(sql`${events.userId} IN (${inClause})`).groupBy(events.userId),
        db.select({ uid: settings.userId, v: settings.value }).from(settings)
          .where(and(sql`${settings.userId} IN (${inClause})`, eq(settings.key, 'SENDS_PAUSED'))),
      ])
      const cMap = new Map(contactRows.map((r) => [r.uid, Number(r.n)]))
      const dMap = new Map(draftRows.map((r) => [r.uid, Number(r.n)]))
      const eMap = new Map(eventRows.map((r) => [r.uid, Number(r.n)]))
      const sMap = new Map(suspRows.map((r) => [r.uid, r.v === 'true']))
      const lines = rows.map((u) =>
        [
          u.id, u.email ?? '', u.name ?? '',
          formatDate(u.createdAt, APP_TZ),
          cMap.get(u.id) ?? 0,
          dMap.get(u.id) ?? 0,
          eMap.get(u.id) ?? 0,
          sMap.get(u.id) ? 'true' : 'false',
        ].map(csvCell).join(',')
      )
      return {
        rows: lines,
        nextCursor: rows[rows.length - 1]!.id,
        done: rows.length < PAGE_SIZE,
      }
    },
  })

  const stamp = new Date().toISOString().slice(0, 10)
  return csvResponse(stream, `users-${stamp}.csv`)
}
