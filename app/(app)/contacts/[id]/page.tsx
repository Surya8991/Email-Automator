import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts, events, emailLog } from '@/server/db/schema'
import { getCompanyByName } from '@/server/services/companies'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2, ExternalLink, Mail, MapPin, BriefcaseBusiness, Tag, CalendarClock, Sparkles } from 'lucide-react'

export default async function ContactDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const cid = Number(id)
  if (!Number.isFinite(cid)) notFound()
  const u = await requireUser()
  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, cid), eq(contacts.userId, u.id)))
    .limit(1)
  if (!contact) notFound()

  const [recentEvents, recentSends, company] = await Promise.all([
    db.select().from(events)
      .where(and(eq(events.userId, u.id), eq(events.contactId, cid)))
      .orderBy(desc(events.ts))
      .limit(20),
    db.select({
      id: emailLog.id,
      subject: emailLog.subject,
      status: emailLog.status,
      scheduledAt: emailLog.scheduledAt,
      lastResult: emailLog.lastResult,
    }).from(emailLog)
      .where(and(eq(emailLog.userId, u.id), eq(emailLog.contactId, cid)))
      .orderBy(desc(emailLog.scheduledAt))
      .limit(10),
    contact.company ? getCompanyByName(u.id, contact.company) : Promise.resolve(null),
  ])

  const tags = contact.tags.split(',').map((t) => t.trim()).filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/contacts" className="inline-flex items-center text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 h-3 w-3" /> All contacts
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{contact.recruiterName || '—'}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {contact.recruiterEmail ? (
                      <a href={`mailto:${contact.recruiterEmail}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                        <Mail className="h-3.5 w-3.5" />{contact.recruiterEmail}
                      </a>
                    ) : null}
                    {contact.jobTitle ? (
                      <span className="inline-flex items-center gap-1.5">
                        <BriefcaseBusiness className="h-3.5 w-3.5" />{contact.jobTitle}{contact.company ? ` at ${contact.company}` : ''}
                      </span>
                    ) : null}
                    {contact.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />{contact.location}
                      </span>
                    ) : null}
                  </div>
                </div>
                {contact.sourceUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={contact.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Source
                    </a>
                  </Button>
                ) : null}
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {tags.map((t) => (
                    <Link key={t} href={`/contacts?tag=${encodeURIComponent(t)}`}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-accent">
                      #{t}
                    </Link>
                  ))}
                </div>
              ) : null}
              {contact.notes ? (
                <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                  {contact.notes}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Recent sends */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent sends ({recentSends.length})</CardTitle>
              <CardDescription>Last 10 emails to this contact.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentSends.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No sends yet.</p>
              ) : (
                <ul className="divide-y">
                  {recentSends.map((r) => (
                    <li key={r.id} className="px-4 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{r.subject}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                          r.status === 'Sent' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : r.status === 'Failed' ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                          : r.status === 'Cancelled' ? 'bg-muted text-muted-foreground'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        }`}>{r.status}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(r.scheduledAt).toLocaleString()}{r.lastResult ? ` · ${r.lastResult}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event timeline ({recentEvents.length})</CardTitle>
              <CardDescription>Last 20 tracked events (opens, clicks, replies, bounces).</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentEvents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No tracking events yet.</p>
              ) : (
                <ul className="divide-y">
                  {recentEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{e.kind}</span>
                      <span className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — Company research card */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" /> Company
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!contact.company ? (
                <p className="text-xs text-muted-foreground">No company on this contact.</p>
              ) : company ? (
                <>
                  <div className="text-base font-semibold">
                    <Link href={`/companies/${company.id}`} className="hover:underline">{company.name}</Link>
                  </div>
                  {company.industry ? <Row k="Industry" v={company.industry} /> : null}
                  {company.hq ? <Row k="HQ" v={company.hq} /> : null}
                  {company.size ? <Row k="Size" v={company.size} /> : null}
                  {company.funding ? <Row k="Funding" v={company.funding} /> : null}
                  {company.techStack ? <Row k="Stack" v={company.techStack} /> : null}
                  {company.salaryRange ? <Row k="Salary" v={company.salaryRange} /> : null}
                  {company.hiringFreq ? <Row k="Hiring" v={company.hiringFreq} /> : null}
                  {company.glassdoor ? <Row k="Glassdoor" v={company.glassdoor} /> : null}
                  {company.notes ? (
                    <div className="mt-2 rounded-md border bg-muted/20 p-2 text-xs italic">
                      {company.notes}
                    </div>
                  ) : null}
                  <div className="pt-2">
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link href={`/companies/${company.id}`}>Edit research</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2 text-center">
                  <p className="text-xs text-muted-foreground">No research record for <strong>{contact.company}</strong>.</p>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/companies/new?name=${encodeURIComponent(contact.company)}`}>
                      <Sparkles className="mr-1 h-3.5 w-3.5" /> Add company
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
      <span className="flex-1">{v}</span>
    </div>
  )
}
