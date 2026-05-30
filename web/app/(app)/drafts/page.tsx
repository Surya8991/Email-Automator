import { requireUser } from '@/auth'
import { listDrafts } from '@/server/services/drafts'
import { Card, CardContent } from '@/components/ui/card'
import { DraftsClient } from './drafts-client'

export default async function DraftsPage() {
  const u = await requireUser()
  const { rows, total } = await listDrafts(u.id, 1, 50)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
        <p className="text-sm text-muted-foreground">{total} pending</p>
      </div>
      <Card><CardContent className="p-0"><DraftsClient rows={rows} /></CardContent></Card>
    </div>
  )
}
