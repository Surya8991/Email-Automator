import { Suspense } from 'react'
import { requireUser } from '@/auth'
import { listContacts, listTags, listDistinct } from '@/server/services/contacts'
import { listCampaigns } from '@/server/services/campaigns'
import { getSetting } from '@/server/services/settings'
import { parseCustomFieldKeys } from '@/lib/custom-fields'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  const [data, allTags, companies, locations, platforms, rawCfKeys, allCampaigns] = await Promise.all([
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{data.total} total{filterBadges ? ` · ${filterBadges}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <ContactsToolbar />
          <AddContactDialog customFieldKeys={customFieldKeys} />
        </div>
      </div>
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
