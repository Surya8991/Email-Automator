import { requireUser } from '@/auth'
import { dailySeries, kpis } from '@/server/services/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Chart } from './chart'

export default async function AnalyticsPage() {
  const u = await requireUser()
  const [k, series] = await Promise.all([kpis(u.id), dailySeries(u.id, 14)])
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
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Sent</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{k.sent}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.openRate * 100).toFixed(1)}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Click rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.clickRate * 100).toFixed(1)}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Reply rate</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{(k.replyRate * 100).toFixed(1)}%</CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Last 14 days</CardTitle></CardHeader>
        <CardContent><Chart data={data} /></CardContent>
      </Card>
    </div>
  )
}
