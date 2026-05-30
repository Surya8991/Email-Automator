'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Trash2, Sparkles, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createDraftsAction, deleteDraftAction, sendAllAction, sendDraftAction } from '@/server/actions/drafts'
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
          if ('error' in r && r.error) { toast.error(r.error); return }
          if ('processed' in r) toast.success(`Created ${r.processed} drafts`)
          router.refresh()
        })}>
          <Sparkles className="mr-1.5 h-4 w-4" /> Create drafts
        </Button>
        {rows.length > 0 ? (
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            if (!confirm(`Send all ${rows.length} drafts now? This will hit your SMTP server.`)) return
            const r = await sendAllAction()
            toast[r.failed ? 'warning' : 'success'](`Sent ${r.sent}${r.failed ? ` · ${r.failed} failed` : ''}`)
            router.refresh()
          })}>
            <SendHorizontal className="mr-1.5 h-4 w-4" /> Send all
          </Button>
        ) : null}
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
            <li key={d.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-muted-foreground">{d.toEmail}</div>
                  <details className="group">
                    <summary className="cursor-pointer list-none font-medium hover:text-primary">
                      {d.subject} <span className="text-xs text-muted-foreground group-open:hidden">— click to preview body</span>
                    </summary>
                    <div className="mt-2 max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                      <div className="prose prose-sm dark:prose-invert max-w-none"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: d.htmlBody }} />
                    </div>
                  </details>
                </div>
                <Button variant="ghost" size="icon" aria-label="Send" disabled={pending}
                  onClick={() => start(async () => {
                    try { await sendDraftAction(d.id); toast.success(`Sent to ${d.toEmail}`) }
                    catch (e) { toast.error(e instanceof Error ? e.message : 'Send failed') }
                    router.refresh()
                  })}>
                  <Send className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" disabled={pending}
                  onClick={() => start(async () => {
                    await deleteDraftAction(d.id); toast(`Deleted draft to ${d.toEmail}`); router.refresh()
                  })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
