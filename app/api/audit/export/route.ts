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

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

// Escape a value for RFC 4180 CSV: wrap in quotes, double any internal quote.
function csv(v: string | null | undefined): string {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: Request) {
  const u = await requireUser()
  const tz = (await getSetting(u.id, 'TIMEZONE').catch(() => null)) || APP_TZ
  const url = new URL(req.url)
  const adminAll = Boolean(u.isAdmin && url.searchParams.get('scope') === 'all')

  const header = adminAll ? 'time,user,action,detail,ip\n' : 'time,action,detail,ip\n'

  // We page by id < lastSeenId because audit rows are append-only and ids
  // are monotonic — gives us a stable cursor without OFFSET (which scans
  // the skipped rows on SQLite).
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()
      controller.enqueue(enc.encode(header))
      let cursor = Number.MAX_SAFE_INTEGER
      try {
        while (true) {
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

          if (rows.length === 0) break
          const chunk = rows.map((r) => {
            const base = [formatDate(r.createdAt, tz)]
            if (adminAll) base.push(r.userEmail ?? '')
            base.push(r.action, r.detail, r.ip)
            return base.map(csv).join(',')
          }).join('\n') + '\n'
          controller.enqueue(enc.encode(chunk))
          cursor = rows[rows.length - 1]!.id
          if (rows.length < PAGE_SIZE) break
        }
      } catch (e) {
        controller.error(e)
        return
      }
      controller.close()
    },
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const scopeTag = adminAll ? 'all-' : ''
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-${scopeTag}${stamp}.csv"`,
    },
  })
}
