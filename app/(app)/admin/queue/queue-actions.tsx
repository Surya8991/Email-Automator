'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recoverStuckRowsAction } from '@/server/actions/admin'

export function QueueActions({ stuck }: { stuck: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button size="sm" variant="outline" disabled={pending || stuck === 0}
        onClick={() => start(async () => {
          setMsg(null)
          const r = await recoverStuckRowsAction()
          if ('error' in r) { setMsg(r.error ?? 'Failed'); return }
          setMsg(`Recovered ${r.recovered ?? 0} row${r.recovered === 1 ? '' : 's'}.`)
          router.refresh()
        })}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Recover stuck ({stuck})
      </Button>
    </div>
  )
}
