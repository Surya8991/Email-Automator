import { Suspense } from 'react'
import { requireUser } from '@/auth'
import { listContacts } from '@/server/services/contacts'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ContactsTable } from './contacts-table'
import { AddContactDialog } from './add-contact-dialog'

export default async function ContactsPage(props: { searchParams: Promise<{ page?: string; search?: string }> }) {
  const search = await props.searchParams
  const u = await requireUser()
  const data = await listContacts(u.id, {
    page: Number(search.page ?? 1),
    search: search.search ?? '',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{data.total} total</p>
        </div>
        <AddContactDialog />
      </div>
      <Card>
        <CardContent className="p-0">
          <Suspense fallback={<div className="p-6 space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>}>
            <ContactsTable rows={data.rows} page={data.page} pages={data.pages} search={search.search ?? ''} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
