// CSV export of the audit log. Streams the rows in 1000-row pages so memory
// stays bounded regardless of how many rows the user has (a 500k-row export
// shouldn't OOM the Lambda). Admins with ?scope=all get an instance-wide
// export including the actor email per row.
import { desc, eq, lt, and } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog, users } from '@/server/db/schema'
import { getSetting } from '@/server/services/settings'
import { formatDate, APP_TZ } from '@/lib/utils'
import { csvCell, csvResponse, streamCsv } from '@/lib/csv-stream'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

export async function GET(req: Request) {
  const u = await requireUser()
  const tz = (await getSetting(u.id, 'TIMEZONE').catch(() => null)) || APP_TZ
  const url = new URL(req.url)
  const adminAll = Boolean(u.isAdmin && url.searchParams.get('scope') === 'all')

  const header = adminAll ? 'time,user,action,detail,ip\n' : 'time,action,detail,ip\n'

  // Page by id < lastSeenId — audit rows are append-only, so monotonic ids
  // give us a stable cursor without OFFSET (which scans skipped rows).
  const stream = streamCsv<number>({
    header,
    initialCursor: Number.MAX_SAFE_INTEGER,
    fetchPage: async (cursor) => {
      const rows = adminAll
        ? await db.select({
            id: auditLog.id, action: auditLog.action, detail: auditLog.detail,
            ip: auditLog.ip, createdAt: auditLog.createdAt, userEmail: users.email,
          }).from(auditLog).leftJoin(users, eq(auditLog.userId, users.id))
          .where(lt(auditLog.id, cursor))
          .orderBy(desc(auditLog.id))
          .limit(PAGE_SIZE)
        : (await db.select().from(auditLog)
            .where(and(eq(auditLog.userId, u.id), lt(auditLog.id, cursor)))
            .orderBy(desc(auditLog.id))
            .limit(PAGE_SIZE)).map((r) => ({ ...r, userEmail: null as string | null }))

      if (rows.length === 0) return { rows: [], nextCursor: cursor, done: true }
      const lines = rows.map((r) => {
        const base: (string | number | null)[] = [formatDate(r.createdAt, tz)]
        if (adminAll) base.push(r.userEmail ?? '')
        base.push(r.action, r.detail, r.ip)
        return base.map(csvCell).join(',')
      })
      return {
        rows: lines,
        nextCursor: rows[rows.length - 1]!.id,
        done: rows.length < PAGE_SIZE,
      }
    },
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const scopeTag = adminAll ? 'all-' : ''
  return csvResponse(stream, `audit-${scopeTag}${stamp}.csv`)
}
