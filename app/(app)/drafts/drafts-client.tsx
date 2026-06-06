'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Trash2, Sparkles, SendHorizontal, Pencil, Save, X, CalendarClock, Search, ChevronLeft, ChevronRight, Inbox, Briefcase, MapPin, ExternalLink } from 'lucide-react'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import {
  deleteDraftAction, sendAllAction, sendDraftAction,
  updateDraftAction, scheduleFollowupAction, sendSelectedDraftsAction,
  deleteSelectedDraftsAction, deleteAllDraftsAction,
  improveDraftAction,
} from '@/server/actions/drafts'
import type { Draft } from '@/server/db/schema'

// Extended draft row includes contact context for job-tracker drafts
type DraftRow = Draft & {
  contactPlatform?: string | null
  contactJobTitle?: string | null
  contactCompany?: string | null
  contactLocation?: string | null
  contactSourceUrl?: string | null
}
import { useProgress } from '@/components/use-progress'
import { AiImprovePicker } from '@/components/ai-improve-picker'
import { CreateDraftsDialog, type TemplateOption } from './create-drafts-dialog'
import { ScheduleSendDialog } from './schedule-send-dialog'
import { SendConfirmDialog } from './send-confirm-dialog'
import { SpamCheckChip } from '@/components/spam-check-chip'

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000]

interface DraftsClientProps {
  rows: DraftRow[]
  /** Kept for prop-compat; AI Improve was originally admin-only. Lifted 2026-06-05. */
  isAdmin?: boolean
  page?: number
  pages?: number
  pageSize?: number
  total?: number
  templates?: TemplateOption[]
}

export function DraftsClient({
  rows,
  page = 1, pages = 1, pageSize = 50, total = 0,
  templates = [],
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
  const [pending, start] = useTransition()
  const progress = useProgress()
  // Schedule-selected dialog state. Lifted to the client root so the
  // dialog renders outside the per-row scrolling list.
  const [scheduleOpen, setScheduleOpen] = useState(false)
  // Send-confirmation dialog, replaces the browser confirm() so the
  // user sees a preview of who they're about to mail. `kind` controls
  // wording + which action fires on confirm.
  const [sendConfirm, setSendConfirm] = useState<null | { kind: 'all' | 'selected' }>(null)
  // Per-row edit state. Open one draft at a time; editing a second closes
  // the first. Tracks the local subject/body so the textarea is unaffected
  // by parent re-renders until save.
  const [editId, setEditId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  // AI Improve UI state, admin-only. Per-row tone picker; null = closed.
  const [aiRowId, setAiRowId] = useState<number | null>(null)
  const [aiBusy, setAiBusy] = useState<number | null>(null)
  // Client-side search, substring match against recipient + subject.
  // Cheap because draft list is capped at 50 rows server-side.
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? rows.filter((d) => {
        const needle = q.toLowerCase()
        return d.toEmail.toLowerCase().includes(needle) || d.subject.toLowerCase().includes(needle)
      })
    : rows
  // Per-row selection, drives the "Send selected" button. Cleared
  // automatically after a send. Visible-row select-all only.
  const [selected, setSelected] = useState<Set<number>>(new Set())

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <CreateDraftsDialog templates={templates} />
        {rows.length > 0 ? (
          <Button variant="outline" disabled={pending} onClick={() => setSendConfirm({ kind: 'all' })}>
            <SendHorizontal className="mr-1.5 h-4 w-4" /> Send all
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <>
            <Button variant="default" disabled={pending} onClick={() => setSendConfirm({ kind: 'selected' })}>
              <SendHorizontal className="mr-1.5 h-4 w-4" /> Send selected ({selected.size})
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setScheduleOpen(true)}
              title="Convert selected drafts into scheduled sends">
              <CalendarClock className="mr-1.5 h-4 w-4" /> Schedule…
            </Button>
          </>
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
        <EmptyState
          icon={Inbox}
          title="No drafts yet"
          description="Personalized emails appear here once you generate a batch from your contacts and template."
          action={<CreateDraftsDialog templates={templates} trigger={
            <Button><Sparkles className="mr-1.5 h-4 w-4" /> Create your first batch</Button>
          } />}
          hint={templates.length === 0 ? (
            <>Create a template in <a className="underline" href="/templates">/templates</a> first.</>
          ) : (
            <>Tip: filter by platform or job title in the dialog to target a specific slice.</>
          )}
        />
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
                {/* Selection checkbox, drives "Send selected (N)" above.
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
                  <div className="text-xs font-mono text-muted-foreground">{d.toEmail || <span className="italic">no email yet — add on contact page</span>}</div>
                  {/* Job-tracker context badge */}
                  {d.contactPlatform === 'jobs-tracker' ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:text-fuchsia-300">
                        <Briefcase className="h-2.5 w-2.5" /> Job tracker
                      </span>
                      {d.contactJobTitle ? <span className="font-medium text-foreground">{d.contactJobTitle}</span> : null}
                      {d.contactCompany ? <span>{d.contactCompany}</span> : null}
                      {d.contactLocation ? (
                        <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> {d.contactLocation}</span>
                      ) : null}
                      {d.contactSourceUrl ? (
                        <a href={d.contactSourceUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 hover:text-primary">
                          View listing <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)}
                        className="font-medium" placeholder="Subject" />
                      <RichTextEditor
                        value={editBody}
                        onChange={setEditBody}
                        rows={12}
                        placeholder="Body"
                      />
                      {/* Spam-trigger lint while editing, shows the same
                          chip pattern as Templates so users get a single
                          consistent signal across the app. */}
                      <SpamCheckChip subject={editSubject} body={editBody} />
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
                {/* Admin-only AI Improve trigger, opens an inline tone
                    picker. Hidden mid-edit because the rewrite would
                    overwrite unsaved changes. */}
                {!isEditing ? (
                  <div className="relative">
                    <Button variant="ghost" size="icon" aria-label="AI Improve" disabled={pending || aiBusy === d.id}
                      title="AI Improve, rewrite in chosen tone"
                      onClick={() => setAiRowId(aiRowId === d.id ? null : d.id)}>
                      <Sparkles className={`h-4 w-4 ${aiBusy === d.id ? 'animate-pulse text-primary' : ''}`} />
                    </Button>
                    {aiRowId === d.id ? (
                      <AiImprovePicker
                        busy={aiBusy === d.id}
                        onCancel={() => setAiRowId(null)}
                        onApply={(tone) => {
                          const draftId = d.id
                          const originalBody = d.htmlBody
                          const originalSubject = d.subject
                          // Snapshot the pre-improve body so the toast's
                          // Undo button can restore it. TTL 1 h.
                          try {
                            localStorage.setItem(`undo-improve-${draftId}`, JSON.stringify({
                              body: originalBody, subject: originalSubject, at: Date.now(),
                            }))
                          } catch { /* quota, proceed without undo */ }
                          setAiBusy(draftId); setAiRowId(null)
                          start(async () => {
                            const r = await improveDraftAction(draftId, tone)
                            setAiBusy(null)
                            if ('error' in r && r.error) { toast.error(r.error); return }
                            toast.success('Draft improved, review before sending', {
                              action: {
                                label: 'Undo',
                                onClick: () => start(async () => {
                                  const raw = localStorage.getItem(`undo-improve-${draftId}`)
                                  if (!raw) { toast.error('Original no longer available'); return }
                                  try {
                                    const saved = JSON.parse(raw) as { body: string; subject: string; at: number }
                                    if (Date.now() - saved.at > 60 * 60 * 1000) {
                                      toast.error('Undo expired (1 h)'); return
                                    }
                                    await updateDraftAction(draftId, { subject: saved.subject, htmlBody: saved.body })
                                    localStorage.removeItem(`undo-improve-${draftId}`)
                                    toast.success('Restored original draft'); router.refresh()
                                  } catch { toast.error('Restore failed') }
                                }),
                              },
                            })
                            // Open the editor on the improved body so the
                            // admin reviews/edits before send.
                            if ('htmlBody' in r && typeof r.htmlBody === 'string') {
                              setEditId(draftId); setEditSubject(d.subject); setEditBody(r.htmlBody)
                            }
                            router.refresh()
                          })
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
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
                    onClick={() => {
                      setEditId(d.id); setEditSubject(d.subject); setEditBody(d.htmlBody)
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

      <ScheduleSendDialog
        draftIds={Array.from(selected)}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onScheduled={() => setSelected(new Set())}
      />

      {/* Send-confirmation dialog, gates both Send all and Send
          selected behind a preview so the user can catch wrong-template
          / wrong-audience mistakes before SMTP fires. */}
      <SendConfirmDialog
        open={Boolean(sendConfirm)}
        onOpenChange={(v) => { if (!v) setSendConfirm(null) }}
        scope={sendConfirm?.kind ?? 'all'}
        drafts={(sendConfirm?.kind === 'selected'
          ? rows.filter((r) => selected.has(r.id))
          : rows
        ).map((d) => ({ id: d.id, subject: d.subject, toEmail: d.toEmail }))}
        totalCount={sendConfirm?.kind === 'selected' ? selected.size : rows.length}
        pending={pending}
        onConfirm={() => {
          const kind = sendConfirm?.kind
          setSendConfirm(null)
          if (!kind) return
          start(async () => {
            if (kind === 'all') {
              const r = await sendAllAction()
              toast[r.failed ? 'warning' : 'success'](`Sent ${r.sent}${r.failed ? ` · ${r.failed} failed` : ''}`)
            } else {
              const ids = Array.from(selected)
              const r = await sendSelectedDraftsAction(ids)
              if ('error' in r && r.error) { toast.error(r.error); return }
              toast[r.failed ? 'warning' : 'success'](`Sent ${r.sent}${r.failed ? ` · ${r.failed} failed` : ''}`)
              setSelected(new Set())
            }
            router.refresh()
          })
        }}
      />
    </div>
  )
}

// Thin wrapper around document.execCommand for the formatting toolbar.
// execCommand is deprecated but every shipping browser still honors it for
