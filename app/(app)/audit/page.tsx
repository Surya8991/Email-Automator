import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
import { eq, desc } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { formatDate, APP_TZ } from '@/lib/utils'
import { getSetting } from '@/server/services/settings'

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
        {u.isAdmin ? (
          <Button variant="outline" size="sm" asChild>
            <a href="/api/backup" download><Download className="mr-1.5 h-4 w-4" /> Download DB backup</a>
          </Button>
        ) : null}
      </div>
      <Card><CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No audit entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.createdAt, tz)}</td>
                  <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</span></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.detail || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  )
}
