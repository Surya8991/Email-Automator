import { requireUser } from '@/auth'
import { listBlocklist } from '@/server/services/blocklist'
import { Card, CardContent } from '@/components/ui/card'
import { BlocklistClient } from './blocklist-client'

export default async function BlocklistPage() {
  const u = await requireUser()
  const rows = await listBlocklist(u.id)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blocklist</h1>
        <p className="text-sm text-muted-foreground">
          Suppress specific emails or whole domains. Unsubscribe clicks add to the global list automatically.
        </p>
      </div>
      <Card><CardContent className="p-0"><BlocklistClient rows={rows} /></CardContent></Card>
    </div>
  )
}
