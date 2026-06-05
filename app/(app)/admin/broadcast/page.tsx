import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { currentBroadcast } from '@/server/services/admin-analytics'
import { BroadcastForm } from './broadcast-form'

export default async function AdminBroadcastPage() {
  const current = await currentBroadcast()
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Broadcast announcement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Posts a short banner across the top of every signed-in page. Use for outages, scheduled
            maintenance, or important policy changes. Submit an empty message to clear.
          </p>
          <BroadcastForm current={current?.message ?? ''} />
          {current ? (
            <p className="text-xs text-muted-foreground">
              Posted at {new Date(current.at).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No active broadcast.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
