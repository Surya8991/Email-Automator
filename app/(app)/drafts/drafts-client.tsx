'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Trash2, Sparkles, SendHorizontal, Pencil, Save, X, CalendarClock, Search, Bold, Italic, Link as LinkIcon, List, Code, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createDraftsAction, deleteDraftAction, sendAllAction, sendDraftAction,
  updateDraftAction, scheduleFollowupAction, sendSelectedDraftsAction,
  deleteSelectedDraftsAction, deleteAllDraftsAction,
  improveDraftAction,
} from '@/server/actions/drafts'
import type { Draft } from '@/server/db/schema'
import { useProgress } from '@/components/use-progress'

type Tone = 'professional' | 'friendly' | 'concise' | 'enthusiastic' | 'formal'

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000]

interface DraftsClientProps {
  rows: Draft[]
  isAdmin?: boolean
  page?: number
  pages?: number
  pageSize?: number
  total?: number
}

export function DraftsClient({
  rows, isAdmin = false,
  page = 1, pages = 1, pageSize = 50, total = 0,
}: DraftsClientProps) {
  const router = useRouter()
  const sp = useSearchParams()
  // Helper to merge URL params (page, pageSize, …) without losing the rest.
  function go(updates: Record<string, string>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v); else next.delete(k)
    }
    router.push(`/drafts?${next.toString()}`)
  }
  const [count, setCount] = useState(10)
  const [pending, start] = useTransition()
  const progress = useProgress()
  // Per-row edit state. Open one draft at a time; editing a second closes
  // the first. Tracks the local subject/body so the textarea is unaffected
  // by parent re-renders until save.
  const [editId, setEditId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  // Editor mode for the body — 'rich' shows a contentEditable WYSIWYG view
  // (default; what users want), 'html' drops to raw HTML for power-users.
  // Switching modes syncs editBody in both directions.
  const [editMode, setEditMode] = useState<'rich' | 'html'>('rich')
  const richRef = useRef<HTMLDivElement | null>(null)
  // AI Improve UI state — admin-only. Per-row tone picker; null = closed.
  const [aiRowId, setAiRowId] = useState<number | null>(null)
  const [aiTone, setAiTone] = useState<Tone>('professional')
  const [aiBusy, setAiBusy] = useState<number | null>(null)
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
        {selected.size > 0 ? (
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
            const ids = Array.from(selected)
            if (!confirm(`Discard ${ids.length} selected draft(s)? Sent emails are untouched.`)) return
            const r = await deleteSelectedDraftsAction(ids)
            if ('error' in r && r.error) { toast.error(r.error); return }
            if ('deleted' in r) toast.success(`Discarded ${r.deleted} draft${r.deleted === 1 ? '' : 's'}`)
            setSelected(new Set())
            router.refresh()
          })}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Discard selected ({selected.size})
          </Button>
        ) : null}
        {rows.length > 0 ? (
          <Button variant="ghost" disabled={pending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => start(async () => {
              if (!confirm(`Discard ALL ${rows.length} pending drafts? Sent emails are untouched.`)) return
              const phrase = prompt('Type DISCARD ALL to confirm:')
              if (phrase !== 'DISCARD ALL') { toast('Cancelled'); return }
              const r = await deleteAllDraftsAction()
              if ('deleted' in r) toast.success(`Discarded ${r.deleted} draft${r.deleted === 1 ? '' : 's'}`)
              setSelected(new Set())
              router.refresh()
            })}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Discard all
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
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
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
                    // Inline editor — subject Input + tabbed body editor.
                    // Default 'rich' is a contentEditable view so non-
                    // technical users edit formatted text directly. Power
                    // users can flip to 'html' for raw markup. Saves
                    // overwrite both subject + htmlBody; plainBody is
                    // recomputed lazily next time the user toggles preview.
                    <div className="mt-2 space-y-2">
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)}
                        className="font-medium" placeholder="Subject" />
                      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
                        <div className="inline-flex overflow-hidden rounded-md border bg-background text-xs">
                          <button type="button"
                            className={`px-2 py-1 ${editMode === 'rich' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
                            onClick={() => {
                              // Pull latest from textarea before switching to rich.
                              setEditMode('rich')
                              // editBody is the source of truth; the rich div is
                              // populated from it via dangerouslySetInnerHTML on mount.
                            }}>
                            <Pencil className="mr-1 inline h-3 w-3" /> Rich
                          </button>
                          <button type="button"
                            className={`border-l px-2 py-1 ${editMode === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-accent'}`}
                            onClick={() => {
                              // Pull latest from contentEditable before showing the textarea.
                              if (richRef.current) setEditBody(richRef.current.innerHTML)
                              setEditMode('html')
                            }}>
                            <Code className="mr-1 inline h-3 w-3" /> HTML
                          </button>
                        </div>
                        {editMode === 'rich' ? (
                          <div className="ml-2 inline-flex items-center gap-0.5">
                            <ToolbarBtn label="Bold (Ctrl+B)" onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
                            <ToolbarBtn label="Italic (Ctrl+I)" onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
                            <ToolbarBtn label="Bullet list" onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></ToolbarBtn>
                            <ToolbarBtn label="Link" onClick={() => {
                              const url = prompt('URL:')?.trim()
                              if (url) exec('createLink', url)
                            }}><LinkIcon className="h-3.5 w-3.5" /></ToolbarBtn>
                          </div>
                        ) : null}
                      </div>
                      {editMode === 'rich' ? (
                        <div
                          ref={richRef}
                          contentEditable
                          suppressContentEditableWarning
                          className="prose prose-sm dark:prose-invert min-h-[12rem] max-w-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: editBody }}
                          // Sync to editBody on blur so the Save button always
                          // has the latest content even if the user clicks
                          // Save before clicking elsewhere.
                          onBlur={(e) => setEditBody((e.target as HTMLDivElement).innerHTML)}
                          onKeyDown={(e) => {
                            // Common keyboard shortcuts. execCommand is
                            // deprecated but still ubiquitously supported and
                            // covers our needs without a real rich-text dep.
                            if (e.ctrlKey || e.metaKey) {
                              if (e.key === 'b') { e.preventDefault(); exec('bold') }
                              else if (e.key === 'i') { e.preventDefault(); exec('italic') }
                            }
                          }}
                        />
                      ) : (
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)}
                          rows={12}
                          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                          placeholder="HTML body" />
                      )}
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
                {/* Admin-only AI Improve trigger — opens an inline tone
                    picker. Hidden mid-edit because the rewrite would
                    overwrite unsaved changes. */}
                {isAdmin && !isEditing ? (
                  <div className="relative">
                    <Button variant="ghost" size="icon" aria-label="AI Improve" disabled={pending || aiBusy === d.id}
                      title="AI Improve (admin)"
                      onClick={() => setAiRowId(aiRowId === d.id ? null : d.id)}>
                      <Sparkles className={`h-4 w-4 ${aiBusy === d.id ? 'animate-pulse text-primary' : ''}`} />
                    </Button>
                    {aiRowId === d.id ? (
                      <div className="absolute right-0 top-9 z-10 w-56 space-y-2 rounded-md border bg-popover p-2 text-sm shadow-md">
                        <label className="block text-xs font-medium text-muted-foreground">Tone</label>
                        <select
                          value={aiTone}
                          onChange={(e) => setAiTone(e.target.value as Tone)}
                          className="block w-full rounded-md border bg-background px-2 py-1 text-xs"
                        >
                          <option value="professional">Professional</option>
                          <option value="friendly">Friendly</option>
                          <option value="concise">Concise</option>
                          <option value="enthusiastic">Enthusiastic</option>
                          <option value="formal">Formal</option>
                        </select>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setAiRowId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" disabled={aiBusy === d.id} onClick={() => {
                            const draftId = d.id
                            setAiBusy(draftId); setAiRowId(null)
                            start(async () => {
                              const r = await improveDraftAction(draftId, aiTone)
                              setAiBusy(null)
                              if ('error' in r && r.error) { toast.error(r.error); return }
                              toast.success('Draft improved — review before sending')
                              // Open the editor on the improved body so the
                              // admin reviews/edits before send.
                              if ('htmlBody' in r && typeof r.htmlBody === 'string') {
                                setEditId(draftId); setEditSubject(d.subject); setEditBody(r.htmlBody); setEditMode('rich')
                              }
                              router.refresh()
                            })
                          }}>
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> Improve
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" aria-label="Save" disabled={pending}
                      onClick={() => start(async () => {
                        // Pull latest from the active editor before saving.
                        const latestBody = editMode === 'rich' && richRef.current
                          ? richRef.current.innerHTML
                          : editBody
                        await updateDraftAction(d.id, { subject: editSubject, htmlBody: latestBody })
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
                    onClick={() => {
                      setEditId(d.id); setEditSubject(d.subject); setEditBody(d.htmlBody)
                      setEditMode('rich')
                    }}>
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

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground" htmlFor="drafts-page-size">
              Rows
              <select
                id="drafts-page-size"
                value={pageSize}
                onChange={(e) => go({ pageSize: e.target.value, page: '1' })}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" disabled={page <= 1}
              onClick={() => go({ page: String(page - 1) })}
              className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button type="button" disabled={page >= pages}
              onClick={() => go({ page: String(page + 1) })}
              className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs disabled:opacity-50">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Thin wrapper around document.execCommand for the formatting toolbar.
// execCommand is deprecated but every shipping browser still honors it for
// these basic operations, and avoiding a real rich-text dep keeps the
// bundle small. The contenteditable div picks up the changes immediately.
function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value)
  } catch {
    /* old Safari quirk — ignore */
  }
}

function ToolbarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep contenteditable selection
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}
