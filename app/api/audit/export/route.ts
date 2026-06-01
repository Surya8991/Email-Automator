// CSV export of the audit log. Streams a download instead of rendering on
// the page so it scales beyond the 500-row UI cap. Admins with ?scope=all
// get an instance-wide export including the actor email per row.
import { desc, eq } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog, users } from '@/server/db/schema'
import { getSetting } from '@/server/services/settings'
import { formatDate, APP_TZ } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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

  const rows = adminAll
    ? await db.select({
        id: auditLog.id, action: auditLog.action, detail: auditLog.detail,
        ip: auditLog.ip, createdAt: auditLog.createdAt, userEmail: users.email,
      }).from(auditLog).leftJoin(users, eq(auditLog.userId, users.id))
      .orderBy(desc(auditLog.id))
    : (await db.select().from(auditLog)
        .where(eq(auditLog.userId, u.id))
        .orderBy(desc(auditLog.id))).map((r) => ({ ...r, userEmail: null as string | null }))

  const header = adminAll ? 'time,user,action,detail,ip\n' : 'time,action,detail,ip\n'
  const body = rows.map((r) => {
    const base = [formatDate(r.createdAt, tz)]
    if (adminAll) base.push(r.userEmail ?? '')
    base.push(r.action, r.detail, r.ip)
    return base.map(csv).join(',')
  }).join('\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const scopeTag = adminAll ? 'all-' : ''
  return new Response(header + body + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-${scopeTag}${stamp}.csv"`,
    },
  })
}
