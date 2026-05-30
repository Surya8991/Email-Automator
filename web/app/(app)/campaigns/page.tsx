import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
      <Card>
        <CardHeader><CardTitle>Sequences (preview)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Schema is in place: <code>campaigns</code>, <code>campaign_steps</code>, <code>campaign_enrollments</code>.</p>
          <p>The worker advances enrollments based on <code>nextRunAt</code> and respects <code>stopOnReply</code>.</p>
          <p>UI to build the step ladder ships next.</p>
        </CardContent>
      </Card>
    </div>
  )
}
