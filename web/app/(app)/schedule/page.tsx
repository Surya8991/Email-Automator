import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SchedulePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      <Card>
        <CardHeader><CardTitle>Coming in the next slice</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The worker process (<code>npm run worker</code>) advances scheduled emails. The UI to enqueue them lands
          alongside campaigns — same enrollment table, different shape.
        </CardContent>
      </Card>
    </div>
  )
}
