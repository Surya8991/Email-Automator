import { Briefcase, AlertTriangle } from 'lucide-react'
import { requireUser } from '@/auth'
import { listSources, listLeads, leadCountsBySource } from '@/server/services/job-tracker'
import { isSchemaMissingError } from '@/lib/action-error'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { EmptyState } from '@/components/ui/empty-state'
import { JobsClient } from './jobs-client'
import type { JobSource, JobLead } from '@/server/db/schema'

export default async function JobsPage() {
  const u = await requireUser()
  // Defensive on both reads — migration 0008 may not be applied to
  // prod yet. Each .catch falls back to an empty array so the page
  // renders an empty-state instead of 500ing.
  // Track whether any underlying read failed because the migration
  // isn't applied yet — drives the banner below. We catch errors here
  // and inspect them with isSchemaMissingError instead of letting the
  // defensive .catch silently mask the operator footgun.
  let schemaMissing = false
  function trackSchema<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    return promise.catch((e) => {
      if (isSchemaMissingError(e)) schemaMissing = true
      console.error(`[jobs] ${label} failed:`, e)
      return fallback
    })
  }
  const [sources, leadsNew, leadsSaved, leadCounts] = await Promise.all([
    trackSchema(listSources(u.id),        [] as JobSource[], 'listSources'),
    trackSchema(listLeads(u.id, 'new'),   [] as JobLead[],   'listLeads(new)'),
    trackSchema(listLeads(u.id, 'saved'), [] as JobLead[],   'listLeads(saved)'),
    trackSchema(leadCountsBySource(u.id), new Map<number, number>(), 'leadCountsBySource'),
  ])
  const activeSources = sources.filter((s) => s.active).length
  return (
    <div className="space-y-6">
      <PageHeader
        accent="fuchsia"
        icon={Briefcase}
        title="Job tracker"
        description="Track job-board search URLs and company career pages. The cron tick fetches each source hourly, AI-extracts new listings, and notifies you."
        pills={[
          { label: 'sources', value: sources.length, tone: 'info' },
          { label: 'active', value: activeSources, tone: activeSources > 0 ? 'success' : 'warn' },
          { label: 'new leads', value: leadsNew.length, tone: leadsNew.length > 0 ? 'info' : 'default' },
          { label: 'saved', value: leadsSaved.length, tone: 'default' },
        ]}
        help={
          <SectionHelp
            title="Job tracker"
            what={<>Add the URL of any job-board search page (LinkedIn, Naukri, Wellfound, the careers page of a company you like). The cron tick fetches it via the SSRF-defended fetcher (HTTPS-only in prod, private IPs blocked, 1 MB cap, 5 s timeout) and AI-extracts visible job listings.</>}
            actions={[
              { label: 'Add a source', hint: 'URL + label + optional comma-separated keywords ("PM, Product Manager, Growth").' },
              { label: 'Refresh', hint: 'Per-source button forces a tick now (rate-limited 6/min).' },
              { label: 'Triage leads', hint: 'Each row has Save / Ignore / Applied. Saved + applied leave the New tray.' },
            ]}
            pitfalls={[
              { label: 'Auth-walled pages', hint: 'LinkedIn search results behind a login wall return very few listings — try the public anonymous URL or a company careers page instead.' },
              { label: 'Cron secret', hint: 'The /api/cron/job-tracker endpoint requires CRON_SECRET (same env var as scheduled sends).' },
            ]}
          />
        }
      />

      {schemaMissing ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 ea-fade-in">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold">Database migration not applied</div>
            <div>
              The Job tracker tables (<code className="rounded bg-amber-500/20 px-1">job_sources</code> + <code className="rounded bg-amber-500/20 px-1">job_leads</code>) aren&apos;t in your database yet. Adding a source or pulling leads will fail until you run:
            </div>
            <pre className="mt-2 overflow-x-auto rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-xs">
{`DATABASE_URL='libsql://your-db.turso.io' \\
TURSO_AUTH_TOKEN='eyJ…' \\
npm run db:migrate`}
            </pre>
            <div className="text-xs">
              Full walkthrough in <a href="/OPERATOR_TODO.html" className="underline">OPERATOR_TODO.html § 1</a>.
            </div>
          </div>
        </div>
      ) : null}

      {sources.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState
            icon={Briefcase}
            title="No job sources yet"
            description="Track a job-board search URL or a company careers page. The cron tick periodically pulls new listings + notifies you."
            hint="Tip: a 'good' source is a URL that already filters to your preferred role + location."
          />
        </CardContent></Card>
      ) : null}

      <JobsClient
        sources={sources.map((s) => ({
          id: s.id, label: s.label, url: s.url, keywords: s.keywords, active: s.active,
          lastFetchedAt: s.lastFetchedAt ?? null,
          lastStatus: s.lastStatus, lastError: s.lastError,
          leadCount: leadCounts.get(s.id) ?? 0,
        }))}
        leadsNew={leadsNew.map((l) => ({
          id: l.id, title: l.title, company: l.company, link: l.link, location: l.location,
          status: l.status, sourceId: l.sourceId, seenAt: l.seenAt,
        }))}
        leadsSaved={leadsSaved.map((l) => ({
          id: l.id, title: l.title, company: l.company, link: l.link, location: l.location,
          status: l.status, sourceId: l.sourceId, seenAt: l.seenAt,
        }))}
      />
    </div>
  )
}
