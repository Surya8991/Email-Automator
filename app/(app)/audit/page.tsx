import Link from 'next/link'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { auditLog, users } from '@/server/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { formatDate, APP_TZ } from '@/lib/utils'
import { getSetting } from '@/server/services/settings'
import { AuditTable } from './audit-table'

export default async function AuditPage(props: { searchParams: Promise<{ scope?: string }> }) {
  const params = await props.searchParams
  const u = await requireUser()
  const adminAll = Boolean(u.isAdmin && params.scope === 'all')

  // Single query, conditionally scoped. When adminAll, drop the userId
  // filter and LEFT JOIN users to surface the actor's email per row.
  const baseQuery = adminAll
    ? db.select({
        id: auditLog.id, action: auditLog.action, detail: auditLog.detail,
        ip: auditLog.ip, createdAt: auditLog.createdAt, userEmail: users.email,
      }).from(auditLog).leftJoin(users, eq(auditLog.userId, users.id))
    : db.select({
        id: auditLog.id, action: auditLog.action, detail: auditLog.detail,
        ip: auditLog.ip, createdAt: auditLog.createdAt,
        userEmail: sql<string | null>`NULL`.as('userEmail'),
      }).from(auditLog).where(eq(auditLog.userId, u.id))

  const [rows, tz] = await Promise.all([
    baseQuery.orderBy(desc(auditLog.id)).limit(500),
    getSetting(u.id, 'TIMEZONE').then((v) => v || APP_TZ).catch(() => APP_TZ),
  ])

  const exportHref = adminAll ? '/api/audit/export?scope=all' : '/api/audit/export'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            {adminAll ? 'Last 500 events across all users.' : 'Last 500 events.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {u.isAdmin ? (
            <div className="inline-flex overflow-hidden rounded-md border text-xs">
              <Link
                href="/audit"
                className={`px-3 py-1.5 ${adminAll ? 'text-muted-foreground hover:bg-accent' : 'bg-muted font-medium'}`}
              >Mine</Link>
              <Link
                href="/audit?scope=all"
                className={`border-l px-3 py-1.5 ${adminAll ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
              >All users</Link>
            </div>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref} download><Download className="mr-1.5 h-4 w-4" /> Export CSV</a>
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
          <AuditTable
            adminAll={adminAll}
            rows={rows.map((r) => ({
              id: r.id, action: r.action, detail: r.detail, ip: r.ip,
              userEmail: r.userEmail ?? '',
              createdAt: formatDate(r.createdAt, tz),
              ts: r.createdAt.getTime(),
            }))} />
        )}
      </CardContent></Card>
    </div>
  )
}

