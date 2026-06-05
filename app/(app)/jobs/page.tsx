import { Briefcase } from 'lucide-react'
import { requireUser } from '@/auth'
import { listSources, listLeads, leadCountsBySource } from '@/server/services/job-tracker'
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
  const [sources, leadsNew, leadsSaved, leadCounts] = await Promise.all([
    listSources(u.id).catch((e) => { console.error('[jobs] listSources failed:', e); return [] as JobSource[] }),
    listLeads(u.id, 'new').catch((e) => { console.error('[jobs] listLeads new failed:', e); return [] as JobLead[] }),
    listLeads(u.id, 'saved').catch((e) => { console.error('[jobs] listLeads saved failed:', e); return [] as JobLead[] }),
    leadCountsBySource(u.id).catch(() => new Map<number, number>()),
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
