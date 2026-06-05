import Link from 'next/link'
import { Suspense } from 'react'
import { Users } from 'lucide-react'
import { requireUser } from '@/auth'
import { listContacts, listTags, listDistinct } from '@/server/services/contacts'
import { listCampaigns } from '@/server/services/campaigns'
import { getSetting } from '@/server/services/settings'
import { followUpBuckets } from '@/server/services/analytics'
import { parseCustomFieldKeys } from '@/lib/custom-fields'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { ContactsTable } from './contacts-table'
import { AddContactDialog } from './add-contact-dialog'
import { ContactsToolbar } from './contacts-toolbar'

// Valid page sizes — kept in lockstep with the UI selector. Anything
// outside this list falls back to 50 to prevent URL-driven over-fetch.
const PAGE_SIZES = [50, 100, 500, 1000]

export default async function ContactsPage(props: { searchParams: Promise<{ page?: string; pageSize?: string; search?: string; tag?: string; status?: string; company?: string; location?: string; platform?: string }> }) {
  const search = await props.searchParams
  const u = await requireUser()
  const requestedSize = Number(search.pageSize ?? 50)
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 50
  const [data, allTags, companies, locations, platforms, rawCfKeys, allCampaigns, followUps] = await Promise.all([
    listContacts(u.id, {
      page: Number(search.page ?? 1),
      pageSize,
      search: search.search ?? '',
      tag: search.tag ?? '',
      status: search.status ?? '',
      company: search.company ?? '',
      location: search.location ?? '',
      platform: search.platform ?? '',
    }),
    listTags(u.id),
    listDistinct(u.id, 'company'),
    listDistinct(u.id, 'location'),
    listDistinct(u.id, 'platform'),
    getSetting(u.id, 'CUSTOM_FIELD_KEYS'),
    listCampaigns(u.id),
    followUpBuckets(u.id),
  ])
  // Only enrollable campaigns end up in the picker — active or draft.
  const enrollableCampaigns = allCampaigns
    .filter((c) => c.status === 'active' || c.status === 'draft')
    .map((c) => ({ id: c.id, name: c.name, status: c.status }))
  const customFieldKeys = parseCustomFieldKeys(rawCfKeys)

  const filterBadges = [
    search.tag ? `#${search.tag}` : null,
    search.status ? search.status : null,
    search.company ? search.company : null,
    search.location ? search.location : null,
    search.platform ? search.platform : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Contacts"
        description={filterBadges || 'Recipients across your platforms. Filter, tag, import CSV, or jump into a contact for full history.'}
        pills={[
          { label: 'total', value: data.total, tone: 'info' },
          { label: 'tags', value: allTags.length },
          { label: 'companies', value: companies.length },
        ]}
        actions={<>
          <ContactsToolbar />
          <AddContactDialog customFieldKeys={customFieldKeys} />
        </>}
        help={
          <SectionHelp
            title="Contacts"
            what={<>The directory of every person you might email. Each row carries a name, email, company, role, plus optional tags, platform, and custom fields. The contacts table feeds both the bulk-draft and campaign-enrollment flows.</>}
            actions={[
              { label: 'Search / filter', hint: 'By name / company / email / role · tag · status · company · location · platform. Filters compose; URL-persisted.' },
              { label: 'Import CSV / Excel', hint: 'Bad rows surface a collapsible error report — not silently dropped.' },
              { label: 'Bulk actions', hint: 'Create drafts · Schedule · Enroll in campaign · Add/Remove tag · Block · Delete. Select-all is per-page.' },
              { label: 'Dedupe', hint: 'Removes rows where both name + email match an existing row (case-insensitive). Same email, different name is kept (shared inboxes).' },
            ]}
            pitfalls={[
              { label: 'Blocked vs deleted', hint: 'Bulk-Block sets emailStatus=BLOCKED; the default list hides it. Removing from /blocklist restores it at the bottom.' },
            ]}
            guideAnchor="contacts"
          />
        }
      />
      {/* Follow-up reminders — buckets of active contacts by last-send recency. */}
      {(followUps.overdue + followUps.soon + followUps.onTrack + followUps.neverSent) > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FollowUpCard label="Overdue (14+ days)" v={followUps.overdue} tone="bad" hint="Last send was more than 14 days ago — likely time to nudge." />
          <FollowUpCard label="Soon (7–13 days)" v={followUps.soon} tone="warn" hint="Approaching the typical follow-up window." />
          <FollowUpCard label="On track (<7 days)" v={followUps.onTrack} tone="ok" hint="Recent contact — give the recipient time." />
          <FollowUpCard label="Never sent" v={followUps.neverSent} hint="Active contacts you haven't emailed yet — candidates for an initial draft." />
        </div>
      ) : null}
      <Card>
        <CardContent className="p-0">
          <Suspense fallback={<div className="p-6 space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>}>
            <ContactsTable
              rows={data.rows}
              page={data.page}
              pages={data.pages}
              pageSize={pageSize}
              total={data.total}
              search={search.search ?? ''}
              tag={search.tag ?? ''}
              status={search.status ?? ''}
              company={search.company ?? ''}
              location={search.location ?? ''}
              platform={search.platform ?? ''}
              allTags={allTags}
              companies={companies}
              locations={locations}
              platforms={platforms}
              campaigns={enrollableCampaigns}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

function FollowUpCard({ label, v, tone, hint }: { label: string; v: number; tone?: 'ok' | 'warn' | 'bad'; hint?: string }) {
  const cls =
    tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : ''
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="text-xs text-muted-foreground" title={hint}>{label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{v}</div>
      </CardContent>
    </Card>
  )
}
