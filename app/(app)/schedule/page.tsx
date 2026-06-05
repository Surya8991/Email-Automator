import { CalendarClock } from 'lucide-react'
import { requireUser } from '@/auth'
import { listScheduled } from '@/server/services/schedule'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ScheduleClient } from './schedule-client'

export default async function SchedulePage() {
  const u = await requireUser()
  const queue = await listScheduled(u.id)
  const retrying = queue.filter((q) => q.status === 'Retrying').length
  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="Schedule"
        description="Enqueue emails to be sent at staggered times. The scheduler tick advances the queue every 30 seconds."
        pills={[
          { label: 'queued', value: queue.length, tone: queue.length > 0 ? 'info' : 'default' },
          { label: 'retrying', value: retrying, tone: retrying > 0 ? 'warn' : 'default' },
        ]}
      />
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
