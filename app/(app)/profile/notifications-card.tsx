'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Webhook, Send } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveNotifySettingsAction, testNotifyAction } from '@/server/actions/notify'

const EVENTS = [
  { key: 'send.completed', label: 'Batch send completed', hint: 'Fires when a Send all / Send selected batch finishes (sent + failed counters).' },
  { key: 'send.failed',    label: 'Send failed',          hint: 'Fires when a single send fails — e.g. SMTP throttling, invalid recipient.' },
  { key: 'bounce',         label: 'Bounce detected',      hint: 'Fires when the Gmail bounce-check labels a recipient as bounced.' },
  { key: 'reply',          label: 'Reply detected',       hint: 'Fires when the Gmail reply-check matches an inbound from a contacted recipient.' },
] as const

export function NotificationsCard({
  currentUrl, currentEvents,
}: {
  currentUrl: string
  currentEvents: string
}) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl)
  const [events, setEvents] = useState<Set<string>>(
    new Set((currentEvents || '').split(',').map((s) => s.trim()).filter(Boolean)),
  )
  const [pending, start] = useTransition()
  const dirty = url !== currentUrl || Array.from(events).sort().join(',') !== currentEvents.split(',').map((s) => s.trim()).sort().join(',')

  function toggleEvent(k: string) {
    setEvents((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  function save() {
    start(async () => {
      const r = await saveNotifySettingsAction({
        webhookUrl: url,
        events: Array.from(events).join(','),
      })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Notifications saved')
      router.refresh()
    })
  }

  function test() {
    start(async () => {
      const r = await testNotifyAction()
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Test sent — check Slack/Discord')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-4 w-4" /> Notifications (Slack / Discord)
        </CardTitle>
        <CardDescription>
          Get a ping in Slack or Discord when sends complete, bounces land, or replies come in. Only <code className="rounded bg-muted px-1">hooks.slack.com</code> and <code className="rounded bg-muted px-1">discord.com</code> URLs are accepted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="notify-url">Incoming-webhook URL</Label>
          <Input
            id="notify-url" type="url"
            value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T0…/B0…/…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Events to forward</Label>
          <div className="grid gap-2">
            {EVENTS.map((e) => (
              <label key={e.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.has(e.key)}
                  onChange={() => toggleEvent(e.key)}
                  className="mt-1 h-4 w-4 accent-primary"
                  aria-describedby={`${e.key}-hint`}
                />
                <div>
                  <div className="font-medium">{e.label}</div>
                  <div id={`${e.key}-hint`} className="text-xs text-muted-foreground">{e.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={pending || !dirty}>Save</Button>
          <Button variant="outline" onClick={test} disabled={pending || !currentUrl}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Send test
          </Button>
          {!currentUrl ? (
            <span className="text-xs text-muted-foreground">Save a URL first to enable test-send.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
