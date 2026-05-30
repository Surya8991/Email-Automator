// CSV export of the user's audit log. Streams a download instead of
// rendering on the page so it scales beyond the 500-row UI cap.
import { desc, eq } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
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

export async function GET() {
  const u = await requireUser()
  const tz = (await getSetting(u.id, 'TIMEZONE').catch(() => null)) || APP_TZ
  // Pull everything — audit log is bounded by the user's actual activity,
  // not unlimited. If it ever gets huge we can add a date-range filter.
  const rows = await db.select().from(auditLog)
    .where(eq(auditLog.userId, u.id))
    .orderBy(desc(auditLog.id))

  const header = 'time,action,detail,ip\n'
  const body = rows.map((r) =>
    [formatDate(r.createdAt, tz), r.action, r.detail, r.ip].map(csv).join(',')
  ).join('\n')

  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(header + body + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-${stamp}.csv"`,
    },
  })
}
