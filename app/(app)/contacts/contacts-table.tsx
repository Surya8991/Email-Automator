'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Trash2, ChevronLeft, ChevronRight, Search, History, X, Tag, Ban, RotateCcw, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Contact } from '@/server/db/schema'
import {
  deleteContactAction, deleteContactsBulkAction,
  bulkTagAction, bulkBlockAction, resetStatusAction,
} from '@/server/actions/contacts'
import { ContactTimeline } from './contact-timeline'

interface Props { rows: Contact[]; page: number; pages: number; search: string; tag: string; allTags: string[] }

export function ContactsTable({ rows, page, pages, search, tag, allTags }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [q, setQ] = useState(search)
  const [timelineFor, setTimelineFor] = useState<Contact | null>(null)

  function go(updates: Record<string, string>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) v ? next.set(k, v) : next.delete(k)
    router.push(`?${next.toString()}`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go({ search: q, page: '1' })}
            placeholder="Search by name, company, email…" className="pl-8" />
        </div>
        {allTags.length > 0 ? (
          <div className="flex items-center gap-1">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <select value={tag} onChange={(e) => go({ tag: e.target.value, page: '1' })}
              className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          </div>
        ) : null}
        {tag ? (
          <Button variant="ghost" size="sm" onClick={() => go({ tag: '', page: '1' })}>
            <X className="mr-1 h-3 w-3" /> Clear filter
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
            <span className="px-1 font-medium">{selected.size} selected</span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
              const t = prompt('Tags to add (comma-separated):')?.trim()
              if (!t) return
              const ids = Array.from(selected)
              start(async () => {
                const r = await bulkTagAction(ids, t, '')
                setSelected(new Set())
                router.refresh()
                if ('updated' in r) alert(`Tagged ${r.updated}`)
              })
            }}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add tag
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
              const t = prompt('Tags to remove (comma-separated):')?.trim()
              if (!t) return
              const ids = Array.from(selected)
              start(async () => {
                await bulkTagAction(ids, '', t); setSelected(new Set()); router.refresh()
              })
            }}>
              <X className="mr-1 h-3.5 w-3.5" /> Remove tag
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
              if (!confirm(`Reset email-status on ${selected.size} contact(s)? They'll be eligible for a new draft.`)) return
              const ids = Array.from(selected)
              start(async () => { await resetStatusAction(ids); setSelected(new Set()); router.refresh() })
            }}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset status
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
              if (!confirm(`Block ${selected.size} email(s) AND remove them from contacts? This adds them to your blocklist.`)) return
              const ids = Array.from(selected)
              start(async () => {
                const r = await bulkBlockAction(ids)
                setSelected(new Set()); router.refresh()
                if ('blocked' in r) alert(`Blocked ${r.blocked}, removed ${r.deleted}`)
              })
            }}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Block
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => {
              if (!confirm(`Delete ${selected.size} contact(s) permanently?`)) return
              const ids = Array.from(selected)
              start(async () => { await deleteContactsBulkAction(ids); setSelected(new Set()); router.refresh() })
            }}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No contacts yet. Click <strong>Add contact</strong> above or use Import.
        </div>
      ) : (
        <>
        {/* Mobile: card list. Table is too wide on phones. */}
        <ul className="divide-y md:hidden">
          {rows.map((c) => (
            <li key={c.id} className="space-y-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.recruiterName || c.recruiterEmail}</div>
                  <div className="truncate text-xs font-mono text-muted-foreground">{c.recruiterEmail}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Timeline" onClick={() => setTimelineFor(c)}>
                  <History className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete contact" disabled={pending}
                  onClick={() => start(async () => { await deleteContactAction(c.id); router.refresh() })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">{[c.company, c.jobTitle].filter(Boolean).join(' · ') || '—'}</div>
              {c.tags ? (
                <div className="text-xs">
                  {c.tags.split(',').filter(Boolean).map((t) => (
                    <button key={t} onClick={() => go({ tag: t, page: '1' })}
                      className="mr-1 rounded bg-muted px-1.5 py-0.5 hover:bg-accent">#{t}</button>
                  ))}
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">{c.emailStatus || 'Pending'}</div>
            </li>
          ))}
        </ul>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  {/* Select-all toggle. Selects the visible page only — not
                      across pages — to avoid surprise deletes on a full
                      multi-page set the user can't currently see. */}
                  <input type="checkbox" aria-label="Select all on this page"
                    checked={rows.length > 0 && rows.every((c) => selected.has(c.id))}
                    onChange={(e) => {
                      const n = new Set(selected)
                      if (e.target.checked) for (const c of rows) n.add(c.id)
                      else for (const c of rows) n.delete(c.id)
                      setSelected(n)
                    }} />
                </th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Select ${c.recruiterEmail}`}
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const n = new Set(selected)
                        e.target.checked ? n.add(c.id) : n.delete(c.id)
                        setSelected(n)
                      }} />
                  </td>
                  <td className="px-3 py-2">{c.recruiterName || '—'}</td>
                  <td className="px-3 py-2">{c.company || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.jobTitle || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.recruiterEmail}</td>
                  <td className="px-3 py-2 text-xs">
                    {(c.tags || '').split(',').filter(Boolean).map((t) => (
                      <button key={t} onClick={() => go({ tag: t, page: '1' })}
                        className="mr-1 rounded bg-muted px-1.5 py-0.5 hover:bg-accent">#{t}</button>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.emailStatus || 'Pending'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" aria-label="Timeline" onClick={() => setTimelineFor(c)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete contact" disabled={pending}
                      onClick={() => start(async () => { await deleteContactAction(c.id); router.refresh() })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {timelineFor ? <ContactTimeline contact={timelineFor} onClose={() => setTimelineFor(null)} /> : null}

      <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">Page {page} of {pages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
