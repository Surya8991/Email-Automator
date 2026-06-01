import { requireUser } from '@/auth'
import { listDrafts } from '@/server/services/drafts'
import { Card, CardContent } from '@/components/ui/card'
import { DraftsClient } from './drafts-client'

// Allowed page sizes — kept in lockstep with the UI selector. Anything
// outside this list falls back to 50 so a bad ?pageSize= URL can't
// over-fetch beyond the server cap.
const PAGE_SIZES = [50, 100, 500, 1000]

export default async function DraftsPage(props: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sp = await props.searchParams
  const u = await requireUser()
  const requestedSize = Number(sp.pageSize ?? 50)
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 50
  const page = Math.max(1, Number(sp.page ?? 1))
  const { rows, total, pageSize: actual } = await listDrafts(u.id, page, pageSize)
  const pages = Math.max(1, Math.ceil(total / actual))
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
        <p className="text-sm text-muted-foreground">{total} pending</p>
      </div>
      <Card><CardContent className="p-0">
        <DraftsClient
          rows={rows}
          isAdmin={Boolean(u.isAdmin)}
          page={page}
          pages={pages}
          pageSize={actual}
          total={total}
        />
      </CardContent></Card>
    </div>
  )
}
