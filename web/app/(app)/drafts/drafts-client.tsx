'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createDraftsAction, deleteDraftAction, sendDraftAction } from '@/server/actions/drafts'
import type { Draft } from '@/server/db/schema'
import { useProgress } from '@/components/use-progress'

export function DraftsClient({ rows }: { rows: Draft[] }) {
  const router = useRouter()
  const [count, setCount] = useState(10)
  const [pending, start] = useTransition()
  const progress = useProgress()

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-24" />
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await createDraftsAction(count)
          if ('error' in r && r.error) alert(r.error)
          router.refresh()
        })}>
          <Sparkles className="mr-1.5 h-4 w-4" /> Create drafts
        </Button>
        {progress ? (
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
            <span>{progress.processed ?? 0} / {progress.total ?? 0}</span>
            <div className="h-1.5 w-40 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, ((progress.processed ?? 0) / Math.max(1, progress.total ?? 1)) * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No pending drafts. Activate a template and click <strong>Create drafts</strong>.
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((d) => (
            <li key={d.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-muted-foreground">{d.toEmail}</div>
                <div className="truncate font-medium">{d.subject}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Send" disabled={pending}
                onClick={() => start(async () => { await sendDraftAction(d.id); router.refresh() })}>
                <Send className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete" disabled={pending}
                onClick={() => start(async () => { await deleteDraftAction(d.id); router.refresh() })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
