import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { activeSendQueue, listAllUsersForFilter, queueHealth, recentFailures } from '@/server/services/admin-analytics'
import type { QueueStatusFilter } from '@/server/services/admin-analytics'
import { ServerFormat } from '../server-format'
import { QueueActions } from './queue-actions'
import { ActiveQueueTable } from './active-queue-table'
import { UserFilter } from './user-filter'
import { StatusFilter } from './status-filter'

const PAGE_SIZE = 50

const VALID_STATUSES = new Set<QueueStatusFilter>(['Scheduled', 'Retrying', 'Sending'])

export default async function AdminQueuePage({
  searchParams,
}: { searchParams: Promise<{ user?: string; status?: string; page?: string }> }) {
  const params = await searchParams
  const userId = params.user || undefined
  const status = params.status && VALID_STATUSES.has(params.status as QueueStatusFilter)
    ? [params.status as QueueStatusFilter]
    : undefined
  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const [queue, active, failures, allUsers] = await Promise.all([
    queueHealth(),
    activeSendQueue(PAGE_SIZE, userId, status, offset),
    recentFailures(20),
    listAllUsersForFilter(),
  ])
  const totalPages = Math.max(1, Math.ceil(active.total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Queue health</CardTitle>
            <QueueActions stuck={queue.stuck} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-7">
            <Cell label="Scheduled" v={queue.scheduled} />
            <Cell label="Sending" v={queue.sending} tone={queue.stuck > 0 ? 'warn' : undefined} />
            <Cell label="Retrying" v={queue.retrying} tone={queue.retrying > 0 ? 'warn' : undefined} />
            <Cell label="Stuck (>10m)" v={queue.stuck} tone={queue.stuck > 0 ? 'bad' : undefined} />
            <Cell label="Sent 24h" v={queue.sent24h} tone="ok" />
            <Cell label="Failed 24h" v={queue.failed24h} tone={queue.failed24h > 0 ? 'bad' : undefined} />
            <Cell label="Cancelled 24h" v={queue.cancelled24h} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              Active queue
              {active.total > PAGE_SIZE ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (showing {offset + 1}–{Math.min(offset + PAGE_SIZE, active.total)} of {active.total})
                </span>
              ) : (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({active.total} total)
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <UserFilter
                users={allUsers.map((u) => ({ id: u.id, email: u.email ?? '—' }))}
                selectedId={userId ?? ''}
              />
              <StatusFilter selected={params.status ?? ''} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActiveQueueTable rows={active.rows} />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <PageLink params={params} page={page - 1} disabled={page === 1}>← Prev</PageLink>
                <PageLink params={params} page={page + 1} disabled={page >= totalPages}>Next →</PageLink>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent failures (20)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {failures.length === 0 ? (
            <p className="px-4 py-6 text-sm text-emerald-600 dark:text-emerald-400">No failures. ✓</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 text-xs text-muted-foreground"><ServerFormat at={r.scheduledAt} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.userEmail}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.recipient}</td>
                    <td className="px-3 py-2 tabular-nums">{r.attempts}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={r.lastResult}>
                      {r.lastResult || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Cell({ label, v, tone }: { label: string; v: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const cls =
    tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : ''
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${cls}`}>{v}</div>
    </div>
  )
}

function PageLink({
  params, page, disabled, children,
}: { params: { user?: string; status?: string }; page: number; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="rounded border bg-muted/30 px-2 py-0.5 text-muted-foreground">{children}</span>
  }
  const u = new URLSearchParams()
  if (params.user) u.set('user', params.user)
  if (params.status) u.set('status', params.status)
  if (page > 1) u.set('page', String(page))
  const href = `/admin/queue${u.toString() ? `?${u}` : ''}`
  return <Link href={href} className="rounded border bg-background px-2 py-0.5 hover:bg-muted">{children}</Link>
}
