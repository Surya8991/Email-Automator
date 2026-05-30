'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Trash2, Sparkles, SendHorizontal, Pencil, Save, X, CalendarClock, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createDraftsAction, deleteDraftAction, sendAllAction, sendDraftAction, updateDraftAction, scheduleFollowupAction, sendSelectedDraftsAction } from '@/server/actions/drafts'
import type { Draft } from '@/server/db/schema'
import { useProgress } from '@/components/use-progress'

export function DraftsClient({ rows }: { rows: Draft[] }) {
  const router = useRouter()
  const [count, setCount] = useState(10)
  const [pending, start] = useTransition()
  const progress = useProgress()
  // Per-row edit state. Open one draft at a time; editing a second closes
  // the first. Tracks the local subject/body so the textarea is unaffected
  // by parent re-renders until save.
  const [editId, setEditId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  // Client-side search — substring match against recipient + subject.
  // Cheap because draft list is capped at 50 rows server-side.
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? rows.filter((d) => {
        const needle = q.toLowerCase()
        return d.toEmail.toLowerCase().includes(needle) || d.subject.toLowerCase().includes(needle)
      })
    : rows
  // Per-row selection — drives the "Send selected" button. Cleared
  // automatically after a send. Visible-row select-all only.
  const [selected, setSelected] = useState<Set<number>>(new Set())

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
        {selected.size > 0 ? (
          <Button variant="default" disabled={pending} onClick={() => start(async () => {
            const ids = Array.from(selected)
            if (!confirm(`Send ${ids.length} selected draft(s) now?`)) return
            const r = await sendSelectedDraftsAction(ids)
            if ('error' in r && r.error) { toast.error(r.error); return }
            toast[r.failed ? 'warning' : 'success'](`Sent ${r.sent}${r.failed ? ` · ${r.failed} failed` : ''}`)
            setSelected(new Set())
            router.refresh()
          })}>
            <SendHorizontal className="mr-1.5 h-4 w-4" /> Send selected ({selected.size})
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

      {rows.length > 0 ? (
        <div className="border-b px-4 py-2 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search recipient or subject…"
              className="pl-8"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={filtered.length > 0 && filtered.every((d) => selected.has(d.id))}
              onChange={(e) => {
                const n = new Set(selected)
                if (e.target.checked) for (const d of filtered) n.add(d.id)
                else for (const d of filtered) n.delete(d.id)
                setSelected(n)
              }}
            />
            Select all visible
          </label>
          {q.trim() ? (
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows.length} drafts</span>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No pending drafts. Activate a template and click <strong>Create drafts</strong>.
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No drafts match &ldquo;{q}&rdquo;.
        </div>
      ) : (
        <ul className="divide-y">
          {filtered.map((d) => {
            const isEditing = editId === d.id
            return (
            <li key={d.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                {/* Selection checkbox — drives "Send selected (N)" above.
                    Disabled while editing this row to avoid losing edits
                    if the user picks "Send selected" by mistake. */}
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  aria-label={`Select ${d.toEmail}`}
                  checked={selected.has(d.id)}
                  disabled={isEditing}
                  onChange={(e) => {
                    const n = new Set(selected)
                    if (e.target.checked) n.add(d.id); else n.delete(d.id)
                    setSelected(n)
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-muted-foreground">{d.toEmail}</div>
                  {isEditing ? (
                    // Inline editor — subject Input + plain HTML textarea.
                    // Saves overwrite both subject + htmlBody; plainBody is
                    // recomputed lazily next time the user toggles preview.
                    <div className="mt-2 space-y-2">
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)}
                        className="font-medium" placeholder="Subject" />
                      <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)}
                        rows={12}
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                        placeholder="HTML body" />
                    </div>
                  ) : (
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
                  )}
                </div>
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" aria-label="Save" disabled={pending}
                      onClick={() => start(async () => {
                        await updateDraftAction(d.id, { subject: editSubject, htmlBody: editBody })
                        setEditId(null); toast.success('Draft updated'); router.refresh()
                      })}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Cancel"
                      onClick={() => setEditId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" aria-label="Edit"
                    onClick={() => { setEditId(d.id); setEditSubject(d.subject); setEditBody(d.htmlBody) }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label="Send" disabled={pending || isEditing}
                  onClick={() => start(async () => {
                    try {
                      const r = await sendDraftAction(d.id)
                      // Duplicate-send guard: the server returns a
                      // 'recent-send' warning instead of sending. Confirm
                      // with the user, then call again with force=true.
                      if ('warning' in r && r.warning === 'recent-send') {
                        const when = new Date(r.lastSentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                        if (!confirm(`You already emailed ${r.email} on ${when} (IST). Send again anyway?`)) return
                        await sendDraftAction(d.id, { force: true })
                      }
                      toast.success(`Sent to ${d.toEmail}`)
                    } catch (e) { toast.error(e instanceof Error ? e.message : 'Send failed') }
                    router.refresh()
                  })}>
                  <Send className="h-4 w-4" />
                </Button>
                {d.contactId ? (
                  <Button variant="ghost" size="icon" aria-label="Schedule follow-up" disabled={pending || isEditing}
                    title="Schedule a follow-up for this contact"
                    onClick={() => {
                      const v = prompt('Send follow-up in how many days?', '3')?.trim()
                      if (!v) return
                      const dDays = Math.max(1, Math.min(60, Number(v) || 0))
                      if (!dDays) return
                      start(async () => {
                        const r = await scheduleFollowupAction(d.contactId!, dDays)
                        if ('error' in r && r.error) toast.error(r.error)
                        else toast.success(`Follow-up in ${dDays}d`)
                        router.refresh()
                      })
                    }}>
                    <CalendarClock className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" aria-label="Delete" disabled={pending}
                  onClick={() => start(async () => {
                    await deleteDraftAction(d.id); toast(`Deleted draft to ${d.toEmail}`); router.refresh()
                  })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
