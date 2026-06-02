import { requireUser } from '@/auth'
import { listScheduled } from '@/server/services/schedule'
import { Card, CardContent } from '@/components/ui/card'
import { ScheduleClient } from './schedule-client'

export default async function SchedulePage() {
  const u = await requireUser()
  const queue = await listScheduled(u.id)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Enqueue emails to be sent at staggered times. Worker advances them every 30 s.
        </p>
      </div>
      <Card><CardContent className="p-0"><ScheduleClient
        queueCount={queue.length}
        isAdmin={u.isAdmin}
        queue={queue.slice(0, 50).map((q) => ({
          id: q.id, email: q.email, subject: q.subject,
          scheduledAt: new Date(q.scheduledAt).toISOString(), status: q.status,
          attempts: q.attempts, lastResult: q.lastResult,
          body: q.body ?? '',
        }))} /></CardContent></Card>
    </div>
  )
}
