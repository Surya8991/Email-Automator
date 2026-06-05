// Overview tab, instance-wide KPIs + at-a-glance health.
// Per-tab pages live under app/(app)/admin/{users,queue,webhooks,system,broadcast}.
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { systemStats } from '@/server/services/analytics'
import { queueHealth, topSenders, recentAdminActions, crossUserDailySeries, failureHeatmap } from '@/server/services/admin-analytics'
import { OverviewChart } from './overview-chart'
import { FailureHeatmap } from './failure-heatmap'
import { ServerFormat } from './server-format'

export default async function AdminOverviewPage() {
  const [stats, queue, senders, recent, series, heat] = await Promise.all([
    systemStats(),
    queueHealth(),
    topSenders(30, 10),
    recentAdminActions(10),
    crossUserDailySeries(30),
    failureHeatmap(30),
  ])

  // Pivot the daily series rows into chart-friendly { day, sent, open, click, ... }
  const dayMap = new Map<string, Record<string, number | string>>()
  for (const r of series) {
    const d = dayMap.get(r.day) ?? { day: r.day, sent: 0, open: 0, click: 0, reply: 0, bounce: 0 }
    d[r.kind] = Number(r.n)
    dayMap.set(r.day, d)
  }
  const chartData = Array.from(dayMap.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-6">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Contacts" value={stats.contacts} />
        <StatCard label="Templates" value={stats.templates} />
        <StatCard label="Drafts pending" value={stats.draftsPending} />
        <StatCard label="Sent (30d)" value={stats.sent30d} />
        <StatCard label="Active campaigns" value={stats.activeCampaigns} />
      </div>

      <Card>
        <CardHeader><CardTitle>Queue snapshot</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-7">
            <Mini label="Scheduled" v={queue.scheduled} />
            <Mini label="Sending" v={queue.sending} tone={queue.stuck > 0 ? 'warn' : undefined} />
            <Mini label="Retrying" v={queue.retrying} tone={queue.retrying > 0 ? 'warn' : undefined} />
            <Mini label="Stuck" v={queue.stuck} tone={queue.stuck > 0 ? 'bad' : undefined} />
            <Mini label="Sent 24h" v={queue.sent24h} tone="ok" />
            <Mini label="Failed 24h" v={queue.failed24h} tone={queue.failed24h > 0 ? 'bad' : undefined} />
            <Mini label="Cancelled 24h" v={queue.cancelled24h} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/admin/queue" className="underline">Open the queue page</Link> to inspect rows.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Send activity, last 30 days (all users)</CardTitle></CardHeader>
          <CardContent>
            <OverviewChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top senders (30d)</CardTitle></CardHeader>
          <CardContent>
            {senders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sends yet in the last 30 days.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {senders.map((s, i) => (
                  <li key={s.userId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {i + 1}
                      </span>
                      <span className="truncate font-mono text-xs" title={s.email}>{s.email}</span>
                    </span>
                    <span className="text-xs tabular-nums">{s.sent}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Failures by hour (30d, IST)</CardTitle></CardHeader>
          <CardContent>
            <FailureHeatmap grid={heat} />
            <p className="mt-2 text-xs text-muted-foreground">Darker cell = more failures. Spot SMTP throttling windows.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent admin actions</CardTitle></CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin actions logged yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 border-b pb-1.5 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{r.action}</span>
                      <span className="text-xs text-muted-foreground">
                        <ServerFormat at={r.createdAt} />
                      </span>
                    </div>
                    {r.detail ? (
                      <span className="truncate text-xs text-muted-foreground" title={r.detail}>{r.detail}</span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">by {r.userEmail}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/audit?scope=all" className="mt-2 inline-block text-xs underline">
              See full audit log →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-semibold tabular-nums">{value}</CardContent>
    </Card>
  )
}

function Mini({ label, v, tone }: { label: string; v: number; tone?: 'ok' | 'warn' | 'bad' }) {
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
