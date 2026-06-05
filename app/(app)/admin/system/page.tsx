import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adminEmails, env } from '@/lib/env'
import { RetentionCard } from '../retention-card'
import { AdminImportContactsCard } from '../import-contacts-card'
import { GlobalBlocklistCard } from './global-blocklist-card'
import { dbHealth, dbLatencyProbe, quotaUsage, listGlobalBlocklist, campaignHealth } from '@/server/services/admin-analytics'

export default async function AdminSystemPage() {
  const [db, latency, quotas, globalBlocks, campaigns] = await Promise.all([
    dbHealth(),
    dbLatencyProbe(),
    quotaUsage(),
    listGlobalBlocklist(),
    campaignHealth(),
  ])
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Database</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Cell label="Driver" v={db.driver === 'libsql' ? 'Turso (libSQL)' : 'SQLite'} />
            <Cell label="File size" v={db.fileSize == null ? 'remote' : humanBytes(db.fileSize)} />
            <Cell label="Events last 7d" v={db.eventsGrowth.last7.toLocaleString()} />
            <Cell label="Events prev 7d" v={db.eventsGrowth.prev7.toLocaleString()}
              tone={db.eventsGrowth.last7 > db.eventsGrowth.prev7 * 1.5 ? 'warn' : undefined} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="px-2 py-1">Table</th><th className="px-2 py-1 text-right">Rows</th></tr>
              </thead>
              <tbody>
                {db.tables.map((t) => (
                  <tr key={t.name} className="border-t">
                    <td className="px-2 py-1 font-mono">{t.name}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{t.n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Database latency (sampled)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Cell label="p50" v={`${latency.p50} ms`} tone={latency.p50 > 50 ? 'warn' : 'ok'} />
            <Cell label="p95" v={`${latency.p95} ms`} tone={latency.p95 > 200 ? 'warn' : undefined} />
            <Cell label="max" v={`${latency.max} ms`} tone={latency.max > 500 ? 'bad' : undefined} />
            <Cell label="samples" v={String(latency.samples)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sampled with a single-row COUNT(*) on this page render. p95 above 200 ms usually means a SQLite write-lock is being held (heavy import / scheduler tick) or a libSQL round-trip is degraded. Reload to re-sample.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Quota usage today (rolling 24h)</CardTitle></CardHeader>
        <CardContent>
          {quotas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sends in the last 24 hours.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {quotas.slice(0, 20).map((q) => (
                <li key={q.userId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs" title={q.email}>{q.email}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {q.sent} / {q.limit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full ${q.pct >= 90 ? 'bg-red-500' : q.pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${q.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <GlobalBlocklistCard rows={globalBlocks} />

      <Card>
        <CardHeader><CardTitle>Active campaigns</CardTitle></CardHeader>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No active or paused campaigns.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">Replied</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">Stopped</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 truncate" title={c.name}>{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.userEmail}</td>
                    <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.status}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.enrollment.active}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.enrollment.replied}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.enrollment.completed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.enrollment.stopped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Admins ({adminEmails.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {adminEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin emails configured. Set <code>ADMIN_EMAILS</code> in your environment.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {adminEmails.map((e) => (
                <li key={e} className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {e}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Runtime configuration</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="DAILY_SEND_LIMIT" v={String(env.DAILY_SEND_LIMIT)} />
            <Row k="TIMEZONE" v={env.TIMEZONE} />
            <Row k="SMTP_HOST" v={env.SMTP_HOST} />
            <Row k="EMAIL_FROM" v={env.EMAIL_FROM || '—'} />
            <Row k="ALLOW_DEV_SIGNIN" v={String(process.env.ALLOW_DEV_SIGNIN === 'true')}
              tone={process.env.ALLOW_DEV_SIGNIN === 'true' ? 'warn' : undefined} />
            <Row k="CRON_SECRET" v={env.CRON_SECRET ? 'set' : 'unset'}
              tone={env.CRON_SECRET ? 'ok' : 'warn'} />
            <Row k="GROQ_API_KEY" v={env.GROQ_API_KEY ? 'set' : 'unset'}
              tone={env.GROQ_API_KEY ? 'ok' : 'muted'} />
            <Row k="GOOGLE_CLIENT_ID" v={env.GOOGLE_CLIENT_ID ? 'set' : 'unset'}
              tone={env.GOOGLE_CLIENT_ID ? 'ok' : 'muted'} />
            <Row k="ENCRYPTION_KEY" v={process.env.ENCRYPTION_KEY ? 'set' : 'unset (using AUTH_SECRET)'}
              tone={process.env.ENCRYPTION_KEY ? 'ok' : 'warn'} />
            <Row k="DATABASE_URL" v={env.DATABASE_URL.startsWith('libsql:') ? 'libsql (turso)' : 'sqlite file'} />
          </dl>
        </CardContent>
      </Card>

      <AdminImportContactsCard />
      <RetentionCard />
    </div>
  )
}

function Cell({ label, v, tone }: { label: string; v: string | number; tone?: 'ok' | 'warn' | 'bad' }) {
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

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const toneClass =
    tone === 'warn' ? 'text-red-600 dark:text-red-400'
    : tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'muted' ? 'text-muted-foreground'
    : ''
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
      <dd className={`font-mono text-xs ${toneClass}`}>{v}</dd>
    </div>
  )
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
