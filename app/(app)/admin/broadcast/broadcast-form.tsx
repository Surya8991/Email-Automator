'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Megaphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { broadcastAction } from '@/server/actions/admin'

export function BroadcastForm({ current }: { current: string }) {
  const router = useRouter()
  const [msg, setMsg] = useState(current)
  const [pending, start] = useTransition()

  function submit() {
    // Clearing a live banner is a destructive site-wide action — confirm
    // before sending so an accidental click on the empty-msg button can't
    // wipe an active maintenance announcement.
    const willClear = msg.trim() === ''
    if (willClear && current.trim() !== '') {
      if (!confirm(`Clear the current broadcast? It will disappear from every signed-in page.\n\nCurrent: "${current}"`)) return
    }
    start(async () => {
      const r = await broadcastAction(msg)
      if ('error' in r) { toast.error(r.error ?? 'Broadcast failed'); return }
      const wasCleared = !('message' in r) || !r.message
      toast.success(wasCleared
        ? 'Broadcast cleared. The banner will disappear from every page on the next navigation.'
        : 'Broadcast posted. It will appear at the top of every signed-in page.')
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
    </div>
  )
}
