import { Briefcase, AlertTriangle } from 'lucide-react'
import { requireAdmin } from '@/auth'
import { listSources, listLeads, leadCountsBySource, adapterFor } from '@/server/services/job-tracker'
import { isSchemaMissingError } from '@/lib/action-error'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { EmptyState } from '@/components/ui/empty-state'
import { JobsClient } from './jobs-client'
import type { JobSource, JobLead } from '@/server/db/schema'

// Shared shape mapper so /jobs and JobsClient agree on which lead
// fields ride along to the client component. Keeps the page tidy.
function mapLeads(rows: JobLead[]) {
  return rows.map((l) => ({
    id: l.id, title: l.title, company: l.company, link: l.link, location: l.location,
    status: l.status, sourceId: l.sourceId, seenAt: l.seenAt,
    postedAt: l.postedAt ?? null, salary: l.salary ?? '', description: l.description ?? '',
    // Normalized fields populated by 0012_lead_normalization migration —
    // drive filtering, dedup, and the salary/remote chips in the UI.
    salaryMin: l.salaryMin ?? null, salaryMax: l.salaryMax ?? null,
    salaryCcy: l.salaryCcy ?? '', salaryPeriod: l.salaryPeriod ?? '',
    locationNorm: l.locationNorm ?? '', remoteScope: l.remoteScope ?? '',
    crossKey: l.crossKey ?? '',
  }))
}

export default async function JobsPage() {
  const u = await requireAdmin()
  // Defensive on both reads — migration 0008 may not be applied to
  // prod yet. Each .catch falls back to an empty array so the page
  // renders an empty-state instead of 500ing.
  // Track whether any underlying read failed because the migration
  // isn't applied yet — drives the banner below. We catch errors here
  // and inspect them with isSchemaMissingError instead of letting the
  // defensive .catch silently mask the operator footgun. Property
  // mutation (not variable reassignment) keeps the react-hooks
  // linter happy without losing the closure-capture pattern.
  const tracker = { schemaMissing: false }
  function trackSchema<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    return promise.catch((e) => {
      if (isSchemaMissingError(e)) tracker.schemaMissing = true
      console.error(`[jobs] ${label} failed:`, e)
      return fallback
    })
  }
  const [sources, leadsNew, leadsSaved, leadsApplied, leadsIgnored, leadCounts] = await Promise.all([
    trackSchema(listSources(u.id),          [] as JobSource[], 'listSources'),
    trackSchema(listLeads(u.id, 'new',     20000), [] as JobLead[], 'listLeads(new)'),
    trackSchema(listLeads(u.id, 'saved',   20000), [] as JobLead[], 'listLeads(saved)'),
    trackSchema(listLeads(u.id, 'applied', 20000), [] as JobLead[], 'listLeads(applied)'),
    trackSchema(listLeads(u.id, 'ignored', 20000), [] as JobLead[], 'listLeads(ignored)'),
    trackSchema(leadCountsBySource(u.id),   new Map<number, number>(), 'leadCountsBySource'),
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
              { label: 'Auth-walled pages', hint: 'LinkedIn search results behind a login wall return very few listings. Try the public anonymous URL or a company careers page instead.' },
              { label: 'Cron secret', hint: 'The /api/cron/job-tracker endpoint requires CRON_SECRET (same env var as scheduled sends).' },
            ]}
          />
        }
      />

      {tracker.schemaMissing ? (
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
          // Adapter name drives the "🟢 Greenhouse" / "🟣 Lever" / "AI fallback"
          // badge in the Sources tab. '' = no dedicated adapter — JSON-LD or
          // AI fallback path; the badge will read "AI fallback" so the user
          // knows that source is paying Groq tokens.
          adapter: adapterFor(s.url),
        }))}
        leadsNew={mapLeads(leadsNew)}
        leadsSaved={mapLeads(leadsSaved)}
        leadsApplied={mapLeads(leadsApplied)}
        leadsIgnored={mapLeads(leadsIgnored)}
        leadsArchive={mapLeads([...leadsApplied, ...leadsIgnored].sort((a, b) =>
          new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime(),
        ))}
      />
    </div>
  )
}
