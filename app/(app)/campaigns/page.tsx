import { requireUser } from '@/auth'
import { listCampaigns } from '@/server/services/campaigns'
import { Card, CardContent } from '@/components/ui/card'
import { Workflow } from 'lucide-react'
import { NewCampaignButton } from './new-campaign-button'
import { CampaignsList } from './campaigns-list'

export default async function CampaignsPage() {
  const u = await requireUser()
  const list = await listCampaigns(u.id)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Multi-step sequences. The worker advances each enrollment based on its delay.
          </p>
        </div>
        <NewCampaignButton />
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="p-10 text-center">
          <Workflow className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No campaigns yet. Click <strong>New campaign</strong> to start one.
          </p>
        </CardContent></Card>
      ) : (
        <CampaignsList list={list.map((c) => ({
          id: c.id, name: c.name, status: c.status, stepCount: c.stepCount, enrolled: c.enrolled,
        }))} />
      )}
    </div>
  )
}
