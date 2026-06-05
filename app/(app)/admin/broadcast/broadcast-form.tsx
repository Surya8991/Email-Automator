'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { broadcastAction } from '@/server/actions/admin'

export function BroadcastForm({ current }: { current: string }) {
  const router = useRouter()
  const [msg, setMsg] = useState(current)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    start(async () => {
      const r = await broadcastAction(msg)
      if ('error' in r) { setStatus(r.error ?? 'Broadcast failed'); return }
      setStatus('message' in r && r.message ? 'Broadcast updated.' : 'Broadcast cleared.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="e.g. Scheduled maintenance Friday 10pm IST"
        rows={3}
        maxLength={280}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{msg.length}/280 chars</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={pending || !msg}
            onClick={() => { setMsg(''); }}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
          <Button size="sm" disabled={pending} onClick={submit}>
            <Megaphone className="mr-1 h-3.5 w-3.5" /> {msg.trim() ? 'Post broadcast' : 'Clear broadcast'}
          </Button>
        </div>
      </div>
      {status && <p className="text-xs text-emerald-600 dark:text-emerald-400">{status}</p>}
    </div>
  )
}
