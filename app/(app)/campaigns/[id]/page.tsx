import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/auth'
import { getCampaign, getStepStats } from '@/server/services/campaigns'
import { listTemplates } from '@/server/services/templates'
import { listTags } from '@/server/services/contacts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CampaignDetail } from './campaign-detail'

export default async function CampaignDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const u = await requireUser()
  const cid = Number(id)
  if (!Number.isFinite(cid)) notFound()
  const data = await getCampaign(u.id, cid)
  if (!data) notFound()
  const [tpls, tags, stepStats] = await Promise.all([
    listTemplates(u.id), listTags(u.id), getStepStats(u.id, cid),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/campaigns" className="text-xs text-muted-foreground hover:underline">← All campaigns</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{data.campaign.name}</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How sequences work</CardTitle>
          <CardDescription className="text-xs">
            The first step fires immediately for every enrolled contact. Each subsequent step waits its
            <em> delay (hours)</em> before sending. The worker process advances enrollments every 30 seconds.
          </CardDescription>
        </CardHeader>
      </Card>

      <CampaignDetail
        campaign={data.campaign}
        steps={data.steps}
        enrollments={data.enrollments}
        templates={tpls.map((t) => ({ id: t.id, label: t.label || t.key, initialMsg: t.initialMsg }))}
        tags={tags}
        stepStats={stepStats}
        isAdmin={u.isAdmin}
      />
    </div>
  )
}
