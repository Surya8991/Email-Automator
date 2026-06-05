import { BarChart3 } from 'lucide-react'
import { requireUser } from '@/auth'
import { dailySeries, kpis, breakdownByTemplate, breakdownByTag, breakdownByCampaign, breakdownByPlatform, sendTimeHeatmap, pipelineKpis } from '@/server/services/analytics'
import { Heatmap } from './heatmap'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Chart } from './chart'
import { PageHeader } from '@/components/ui/page-header'

export default async function AnalyticsPage() {
  const u = await requireUser()
  const [k, series, byTpl, byTag, byCamp, byPlatform, heatmap, pipeline] = await Promise.all([
    kpis(u.id), dailySeries(u.id, 14),
    breakdownByTemplate(u.id, 30),
    breakdownByTag(u.id, 30),
    breakdownByCampaign(u.id, 30),
    breakdownByPlatform(u.id, 30),
    sendTimeHeatmap(u.id, 30),
    // Admin-only pipeline row — non-admins get the work skipped.
    u.isAdmin ? pipelineKpis(u.id) : Promise.resolve(null),
  ])
  // Pivot rows into one row per day with one column per kind for Recharts.
  type DayRow = { day: string; sent: number; open: number; click: number; reply: number; bounce: number; [k: string]: string | number }
  const byDay = new Map<string, DayRow>()
  for (const r of series) {
    const existing = byDay.get(r.day) ?? { day: r.day, sent: 0, open: 0, click: 0, reply: 0, bounce: 0 }
    existing[r.kind] = Number(r.n)
    byDay.set(r.day, existing)
  }
  const data = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day))

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        description="Sent / opens / clicks / replies, plus daily series, send-time heatmap, and per-template / tag / campaign / platform breakdowns."
        pills={[
          { label: 'sent', value: k.sent, tone: 'info' },
          { label: 'open rate', value: `${(k.openRate * 100).toFixed(1)}%`, tone: k.openRate > 0.2 ? 'success' : 'default' },
          { label: 'reply rate', value: `${(k.replyRate * 100).toFixed(1)}%`, tone: k.replyRate > 0.05 ? 'success' : 'default' },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Sent</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{k.sent}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.openRate * 100).toFixed(1)}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Click rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.clickRate * 100).toFixed(1)}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Reply rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.replyRate * 100).toFixed(1)}%</CardContent></Card>
      </div>
      {pipeline && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Card><CardHeader><CardTitle className="text-sm">Total applied</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{pipeline.applied}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Active pipeline</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{pipeline.pipeline}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Offers</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{pipeline.offers}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Response rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(pipeline.responseRate * 100).toFixed(1)}%</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Rejections</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{pipeline.rejections}</CardContent></Card>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Last 14 days</CardTitle></CardHeader>
        <CardContent><Chart data={data} /></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <BreakdownCard title="By template" rows={byTpl} />
        <BreakdownCard title="By campaign" rows={byCamp} />
        <BreakdownCard title="By tag" rows={byTag} />
        <BreakdownCard title="By platform" rows={byPlatform} />
      </div>

      <Card>
        <CardHeader><CardTitle>Send-time effectiveness (30d)</CardTitle></CardHeader>
        <CardContent><Heatmap cells={heatmap} /></CardContent>
      </Card>
    </div>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ key: string; label: string; sent: number; opens: number; clicks: number; replies: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title} (30d)</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No activity yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">Name</th>
                <th className="px-3 py-1.5 text-right">Sent</th>
                <th className="px-3 py-1.5 text-right">Open</th>
                <th className="px-3 py-1.5 text-right">Click</th>
                <th className="px-3 py-1.5 text-right">Reply</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((r) => {
                const pct = (n: number) => r.sent > 0 ? `${Math.round((n / r.sent) * 100)}%` : '—'
                return (
                  <tr key={r.key} className="border-t">
                    <td className="px-3 py-1.5 truncate max-w-[10rem]" title={r.label}>{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.sent}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{pct(r.opens)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{pct(r.clicks)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{pct(r.replies)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
