import { requireUser } from '@/auth'
import { listCampaigns } from '@/server/services/campaigns'
import { Card, CardContent } from '@/components/ui/card'
import { Workflow } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHelp } from '@/components/section-help'
import { EmptyState } from '@/components/ui/empty-state'
import { NewCampaignButton } from './new-campaign-button'
import { CampaignsList } from './campaigns-list'

export default async function CampaignsPage() {
  const u = await requireUser()
  const list = await listCampaigns(u.id)
  const running = list.filter((c) => c.status === 'running').length
  const enrolled = list.reduce((a, c) => a + (c.enrolled ?? 0), 0)
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Workflow}
        title="Campaigns"
        description="Multi-step sequences. The worker advances each enrollment based on its per-step delay."
        pills={[
          { label: 'campaigns', value: list.length },
          { label: 'running', value: running, tone: running > 0 ? 'success' : 'default' },
          { label: 'enrolled', value: enrolled, tone: enrolled > 0 ? 'info' : 'default' },
        ]}
        actions={<NewCampaignButton />}
        help={
          <SectionHelp
            title="Campaigns"
            what={<>Multi-step email sequences. Step 1 fires immediately on enrollment, each later step waits its <em>delay (hours)</em> from the prior send. The worker process advances enrollments every 30 seconds.</>}
            actions={[
              { label: 'Enroll', hint: 'Bulk-enroll contacts from /contacts or single-add from the campaign detail.' },
              { label: 'A/B variants', hint: 'Per step: weighted template variants. Routing is hash-deterministic per contact.' },
              { label: 'Stop on reply', hint: 'Default-on per step. A detected reply marks the enrollment Replied and the rest of the sequence is skipped.' },
            ]}
            pitfalls={[
              { label: 'Status confusion', hint: 'Draft / running / paused. A paused campaign holds new enrollments but does not stop in-flight ones — pause + complete to drain.' },
            ]}
            guideAnchor="campaigns"
          />
        }
      />

      {list.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState
            icon={Workflow}
            title="No campaigns yet"
            description="Campaigns let you send a sequence of touches over days or weeks. Each step has its own template, delay, and A/B variants."
            action={<NewCampaignButton />}
            hint="Each step picks up after its delay elapses — the worker checks every 30 s."
          />
        </CardContent></Card>
      ) : (
        <CampaignsList list={list.map((c) => ({
          id: c.id, name: c.name, status: c.status, stepCount: c.stepCount, enrolled: c.enrolled,
        }))} />
      )}
    </div>
  )
}
