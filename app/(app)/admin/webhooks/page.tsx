import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { webhookHealth } from '@/server/services/admin-analytics'
import { ServerFormat } from '../server-format'

export default async function AdminWebhooksPage() {
  const rows = await webhookHealth()
  const healthy = rows.filter((r) => r.lastStatus != null && r.lastStatus < 400).length
  const failing = rows.filter((r) => r.lastStatus != null && r.lastStatus >= 400).length
  const untested = rows.filter((r) => r.lastStatus == null).length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Webhook health</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Cell label="Total" v={rows.length} />
            <Cell label="Healthy (last < 400)" v={healthy} tone="ok" />
            <Cell label="Failing (last ≥ 400)" v={failing} tone={failing > 0 ? 'bad' : undefined} />
            <Cell label="Untested" v={untested} tone={untested > 0 ? 'warn' : undefined} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All webhooks</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No webhooks configured by any user.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Events</th>
                  <th className="px-3 py-2">Last status</th>
                  <th className="px-3 py-2">Last delivery</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.userEmail}</td>
                    <td className="px-3 py-2 truncate font-mono text-xs" title={r.url}>{r.url}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.events}</td>
                    <td className="px-3 py-2">
                      {r.lastStatus == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                          r.lastStatus < 400 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-500/15 text-red-700 dark:text-red-400'
                        }`}>{r.lastStatus}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.lastDeliveryAt ? <ServerFormat at={r.lastDeliveryAt} /> : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={r.lastError ?? ''}>
                      {r.lastError || '—'}
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
