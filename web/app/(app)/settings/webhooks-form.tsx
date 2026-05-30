'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Plus, Send, Trash2, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createWebhookAction, deleteWebhookAction, testWebhooksAction } from '@/server/actions/webhooks'
import { formatDate } from '@/lib/utils'

interface Row {
  id: number; url: string; events: string; lastStatus: number | null;
  lastDeliveryAt: Date | null; lastError: string | null; createdAt: Date
}

const ALL_EVENTS = ['sent', 'open', 'click', 'reply', 'bounce', 'unsubscribe'] as const

export function WebhooksForm({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<Set<string>>(new Set(ALL_EVENTS))
  const [revealed, setRevealed] = useState<{ secret: string } | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input id="webhook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..." />
        </div>
        <Button disabled={pending || !url || events.size === 0} onClick={() => start(async () => {
          const r = await createWebhookAction({ url, events: Array.from(events).join(',') })
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('secret' in r && r.secret) { setRevealed({ secret: r.secret }); setUrl(''); router.refresh() }
        })}>
          <Plus className="mr-1.5 h-4 w-4" /> Add webhook
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Subscribe to:</span>
        {ALL_EVENTS.map((e) => {
          const on = events.has(e)
          return (
            <button key={e} type="button" onClick={() => {
              const n = new Set(events); on ? n.delete(e) : n.add(e); setEvents(n)
            }} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}>
              {e}
            </button>
          )
        })}
      </div>

      {revealed ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="text-sm font-medium">Signing secret — store it now</div>
          <p className="text-xs text-muted-foreground">Use this to verify HMAC-SHA256 signatures sent in the <code>X-EA-Signature</code> header. It's NOT shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{revealed.secret}</code>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(revealed.secret); toast.success('Copied') }}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>Dismiss</Button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhooks yet. Add one to receive POSTs on every email event.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-1">URL</th>
              <th className="p-1">Events</th>
              <th className="p-1">Last status</th>
              <th className="p-1">Last delivery</th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="p-1 truncate max-w-xs"><Webhook className="inline mr-1 h-3 w-3 text-muted-foreground" />{w.url}</td>
                <td className="p-1 text-xs">{w.events}</td>
                <td className="p-1">
                  {w.lastStatus == null
                    ? <span className="text-xs text-muted-foreground">—</span>
                    : <span className={`rounded px-1.5 py-0.5 text-xs ${w.lastStatus >= 200 && w.lastStatus < 300 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-destructive/15 text-destructive'}`}>{w.lastStatus || 'error'}</span>}
                  {w.lastError ? <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={w.lastError}>{w.lastError}</div> : null}
                </td>
                <td className="p-1 text-xs text-muted-foreground">{w.lastDeliveryAt ? formatDate(w.lastDeliveryAt) : 'never'}</td>
                <td className="p-1 text-right">
                  <Button variant="ghost" size="icon" aria-label="Delete" disabled={pending}
                    onClick={() => {
                      if (!confirm('Delete this webhook?')) return
                      start(async () => { await deleteWebhookAction(w.id); router.refresh() })
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 ? (
        <Button variant="outline" size="sm" disabled={pending}
          onClick={() => start(async () => { await testWebhooksAction(); toast('Sent test event'); router.refresh() })}>
          <Send className="mr-1.5 h-3 w-3" /> Send test event to all
        </Button>
      ) : null}

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Verifying the signature on your end</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono">{`// Node.js
import crypto from 'node:crypto'
app.post('/hook', (req, res) => {
  const sig = req.headers['x-ea-signature']
  const ok = crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex')),
  )
  if (!ok) return res.sendStatus(401)
  // ...
})`}</pre>
      </details>
    </div>
  )
}
