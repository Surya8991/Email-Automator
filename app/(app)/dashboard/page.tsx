import Link from 'next/link'
import { requireUser } from '@/auth'
import { kpis } from '@/server/services/analytics'
import { db } from '@/server/db/client'
import { events, emailLog, contacts } from '@/server/db/schema'
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Send, MailCheck, MousePointerClick, Reply, AlertTriangle, Sparkles, Upload, FileText, Activity, Clock, LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
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
  const [k, recent, nextScheduledRow, tz] = await Promise.all([
    kpis(u.id),
    db.select().from(events).where(eq(events.userId, u.id)).orderBy(desc(events.ts)).limit(10),
    // Earliest still-pending row in the queue. Drives the "Next send"
    // card so the user can see when the worker will next run their work.
    db.select({ scheduledAt: emailLog.scheduledAt, email: emailLog.email, subject: emailLog.subject })
      .from(emailLog)
      .where(and(eq(emailLog.userId, u.id), or(eq(emailLog.status, 'Scheduled'), eq(emailLog.status, 'Retrying'))!))
      .orderBy(asc(emailLog.scheduledAt)).limit(1),
    getSetting(u.id, 'TIMEZONE').then((v) => v || APP_TZ).catch(() => APP_TZ),
  ])
  // Look up contact emails for the recent-activity rows so they show
  // "Sent · to alice@x.co" not just "Sent · subject".
  const contactIds = Array.from(new Set(recent.map((e) => e.contactId).filter((id): id is number => typeof id === 'number')))
  const contactEmailMap = new Map<number, string>()
  if (contactIds.length > 0) {
    const cs = await db.select({ id: contacts.id, email: contacts.recruiterEmail })
      .from(contacts).where(and(eq(contacts.userId, u.id), inArray(contacts.id, contactIds)))
    for (const c of cs) contactEmailMap.set(c.id, c.email)
  }
  const nextScheduled = nextScheduledRow[0] ?? null
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const empty = k.totalContacts === 0

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Your last 30 days at a glance — sent, opens, clicks, replies, plus recent activity."
        pills={[
          { label: 'sent', value: k.sent, tone: 'info' },
          { label: 'opens', value: k.opens, tone: 'default' },
          { label: 'replies', value: k.replies, tone: k.replies > 0 ? 'success' : 'default' },
        ]}
      />

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

      {/* Next-send card — only shows when there's something queued. Tells
          the user *when* the worker will next fire so they don't have to
          jump to /schedule to find out. */}
      {nextScheduled ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" /> Next send
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium">{formatDate(nextScheduled.scheduledAt, tz)}</span>
            <span className="text-muted-foreground">→ {nextScheduled.email}</span>
            <span className="text-xs text-muted-foreground truncate max-w-md">{nextScheduled.subject}</span>
            <Link href="/schedule" className="ml-auto text-xs underline">View queue →</Link>
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
                  const m = JSON.parse(e.meta || '{}') as { subject?: string; url?: string; campaignId?: number; step?: number }
                  detail = m.subject ?? m.url ?? ''
                } catch { /* ignore */ }
                // Enrich with the contact email + (if applicable) the
                // campaign/step it belongs to — so "Opened" rows answer
                // "by whom?" without a click.
                const contactEmail = e.contactId ? contactEmailMap.get(e.contactId) : null
                let campaignBadge: string | null = null
                try {
                  const m = JSON.parse(e.meta || '{}') as { campaignId?: number; step?: number }
                  if (m.campaignId) campaignBadge = `Campaign #${m.campaignId}${typeof m.step === 'number' ? ` · step ${m.step + 1}` : ''}`
                } catch { /* ignore */ }
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs shrink-0">{KIND_LABEL[e.kind] ?? e.kind}</span>
                      {contactEmail ? <span className="shrink-0 font-mono text-xs">{contactEmail}</span> : null}
                      {campaignBadge ? <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{campaignBadge}</span> : null}
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
