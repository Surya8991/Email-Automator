import { Suspense } from 'react'
import { requireUser } from '@/auth'
import { listContacts, listTags } from '@/server/services/contacts'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ContactsTable } from './contacts-table'
import { AddContactDialog } from './add-contact-dialog'
import { ContactsToolbar } from './contacts-toolbar'

export default async function ContactsPage(props: { searchParams: Promise<{ page?: string; search?: string; tag?: string }> }) {
  const search = await props.searchParams
  const u = await requireUser()
  const [data, allTags] = await Promise.all([
    listContacts(u.id, {
      page: Number(search.page ?? 1),
      search: search.search ?? '',
      tag: search.tag ?? '',
    }),
    listTags(u.id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{data.total} total{search.tag ? ` · #${search.tag}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <ContactsToolbar />
          <AddContactDialog />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Suspense fallback={<div className="p-6 space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>}>
            <ContactsTable
              rows={data.rows}
              page={data.page}
              pages={data.pages}
              search={search.search ?? ''}
              tag={search.tag ?? ''}
              allTags={allTags}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
