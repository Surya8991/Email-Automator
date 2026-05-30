import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
import { eq, desc } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { formatDate, APP_TZ } from '@/lib/utils'
import { getSetting } from '@/server/services/settings'
import { AuditTable } from './audit-table'

export default async function AuditPage() {
  const u = await requireUser()
  const [rows, tz] = await Promise.all([
    db.select().from(auditLog).where(eq(auditLog.userId, u.id))
      .orderBy(desc(auditLog.id)).limit(500),
    getSetting(u.id, 'TIMEZONE').then((v) => v || APP_TZ).catch(() => APP_TZ),
  ])
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Last 500 events.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/audit/export" download><Download className="mr-1.5 h-4 w-4" /> Export CSV</a>
          </Button>
          {u.isAdmin ? (
            <Button variant="outline" size="sm" asChild>
              <a href="/api/backup" download><Download className="mr-1.5 h-4 w-4" /> Download DB backup</a>
            </Button>
          ) : null}
        </div>
      </div>
      <Card><CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No audit entries yet.</div>
        ) : (
          // Pre-format timestamps server-side so the client component stays
          // pure presentational (no TZ context dependency, no hydration risk).
          <AuditTable rows={rows.map((r) => ({
            id: r.id, action: r.action, detail: r.detail, ip: r.ip,
            createdAt: formatDate(r.createdAt, tz),
            ts: r.createdAt.getTime(),
          }))} />
        )}
      </CardContent></Card>
    </div>
  )
}
