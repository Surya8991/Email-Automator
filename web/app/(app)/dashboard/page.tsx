import { requireUser } from '@/auth'
import { kpis } from '@/server/services/analytics'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, Send, MailCheck, MousePointerClick, Reply, AlertTriangle } from 'lucide-react'

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const u = await requireUser()
  const k = await kpis(u.id)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last 30 days</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contacts" value={k.totalContacts} icon={Users} />
        <Stat label="Pending drafts" value={k.pendingDrafts} icon={Send} />
        <Stat label="Sent" value={k.sent} icon={MailCheck} />
        <Stat label="Open rate" value={pct(k.openRate)} icon={MousePointerClick} />
        <Stat label="Click rate" value={pct(k.clickRate)} icon={MousePointerClick} />
        <Stat label="Reply rate" value={pct(k.replyRate)} icon={Reply} />
        <Stat label="Bounce rate" value={pct(k.bounceRate)} icon={AlertTriangle} />
      </div>
    </div>
  )
}
