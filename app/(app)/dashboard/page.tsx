import Link from 'next/link'
import { requireUser } from '@/auth'
import { kpis } from '@/server/services/analytics'
import { db } from '@/server/db/client'
import { events } from '@/server/db/schema'
import { desc, eq } from 'drizzle-orm'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Send, MailCheck, MousePointerClick, Reply, AlertTriangle, Sparkles, Upload, FileText, Activity } from 'lucide-react'
import { formatDate, APP_TZ } from '@/lib/utils'
import { getSetting } from '@/server/services/settings'

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

const KIND_LABEL: Record<string, string> = {
  sent: 'Sent',
  open: 'Opened',
  click: 'Clicked',
  reply: 'Replied',
  bounce: 'Bounced',
  unsubscribe: 'Unsubscribed',
}

export default async function DashboardPage() {
  const u = await requireUser()
  // Pick up the user's TZ for the Recent Activity timestamps. Server-rendered
  // here, so we can't use the client useFormatDate() hook — pass it as the
  // 2nd arg to formatDate instead.
  const [k, recent, tz] = await Promise.all([
    kpis(u.id),
    db.select().from(events).where(eq(events.userId, u.id)).orderBy(desc(events.ts)).limit(10),
    getSetting(u.id, 'TIMEZONE').then((v) => v || APP_TZ).catch(() => APP_TZ),
  ])
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const empty = k.totalContacts === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last 30 days</p>
      </div>

      {empty ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Get started in 3 steps</CardTitle>
            <CardDescription>You don't have any contacts yet — let's fix that.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link href="/contacts"><Upload className="mr-1.5 h-4 w-4" /> Import contacts</Link></Button>
            <Button variant="outline" asChild><Link href="/templates"><FileText className="mr-1.5 h-4 w-4" /> Pick a template</Link></Button>
            <Button variant="outline" asChild><Link href="/drafts"><Send className="mr-1.5 h-4 w-4" /> Create drafts</Link></Button>
            <Button variant="ghost" asChild><Link href="/guide">Read the guide →</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contacts" value={k.totalContacts} icon={Users} />
        <Stat label="Pending drafts" value={k.pendingDrafts} icon={Send} />
        <Stat label="Sent" value={k.sent} icon={MailCheck} />
        <Stat label="Open rate" value={pct(k.openRate)} icon={MousePointerClick} />
        <Stat label="Click rate" value={pct(k.clickRate)} icon={MousePointerClick} />
        <Stat label="Reply rate" value={pct(k.replyRate)} icon={Reply} />
        <Stat label="Bounce rate" value={pct(k.bounceRate)} icon={AlertTriangle} />
      </div>

      {/* Recent activity — only useful once the user has any. Returning users
          land here first; this is the answer to "what happened while I was gone?" */}
      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Recent activity</CardTitle>
            <CardDescription>Last 10 events. <Link href="/audit" className="underline">Full audit →</Link></CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recent.map((e) => {
                let detail = ''
                try {
                  const m = JSON.parse(e.meta || '{}') as { subject?: string; url?: string }
                  detail = m.subject ?? m.url ?? ''
                } catch { /* ignore */ }
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{KIND_LABEL[e.kind] ?? e.kind}</span>
                      <span className="truncate text-muted-foreground">{detail || '—'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.ts, tz)}</span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
