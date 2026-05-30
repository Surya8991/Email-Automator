import Link from 'next/link'
import { requireUser } from '@/auth'
import { listCampaigns } from '@/server/services/campaigns'
import { Card, CardContent } from '@/components/ui/card'
import { Workflow } from 'lucide-react'
import { NewCampaignButton } from './new-campaign-button'

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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">{c.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      c.status === 'active' ? 'bg-emerald-500/15 text-emerald-600' :
                      c.status === 'paused' ? 'bg-amber-500/15 text-amber-600' :
                      c.status === 'archived' ? 'bg-muted text-muted-foreground' :
                      'bg-muted text-foreground'
                    }`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div><span className="font-medium text-foreground">{c.stepCount}</span> steps</div>
                    <div><span className="font-medium text-foreground">{c.enrolled}</span> enrolled</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
