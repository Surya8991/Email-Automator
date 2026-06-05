'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, RefreshCw, Trash2, ExternalLink, Bookmark, Briefcase, CheckCircle2, XCircle, Building2,
  Search, Download, MailPlus, Pause, Play, Pencil, RefreshCcw, Archive, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  addJobSourceAction, deleteJobSourceAction, refreshJobSourceAction, setJobLeadStatusAction,
  leadToDraftAction, bulkSetJobLeadStatusAction, toggleJobSourceActiveAction,
  editJobSourceAction, refreshAllForUserAction,
} from '@/server/actions/job-tracker'
import { JobPresetPicker } from './preset-picker'

interface SourceRow {
  id: number; label: string; url: string; keywords: string; active: boolean
  lastFetchedAt: number | null; lastStatus: string; lastError: string
  leadCount: number
}
interface LeadRow {
  id: number; title: string; company: string; link: string; location: string
  status: string; sourceId: number; seenAt: Date
}

export function JobsClient({
  sources, leadsNew, leadsSaved, leadsArchive,
}: {
  sources: SourceRow[]; leadsNew: LeadRow[]; leadsSaved: LeadRow[]; leadsArchive: LeadRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'new' | 'saved' | 'archive' | 'sources'>(sources.length === 0 ? 'sources' : 'new')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<'new' | 'saved' | 'archive' | 'sources'>
          value={tab} onChange={setTab}
          ariaLabel="Jobs view"
          options={[
            { value: 'new',     label: `New (${leadsNew.length})`,         icon: Briefcase },
            { value: 'saved',   label: `Saved (${leadsSaved.length})`,     icon: Bookmark },
            { value: 'archive', label: `Archive (${leadsArchive.length})`, icon: Archive },
            { value: 'sources', label: `Sources (${sources.length})`,       icon: Building2 },
          ]}
        />
        <div className="flex items-center gap-2">
          {sources.length > 0 ? (
            <Button
              variant="outline" size="sm" disabled={pending}
              onClick={() => start(async () => {
                const r = await refreshAllForUserAction()
                if ('error' in r && r.error) { toast.error(r.error); return }
                if ('addedTotal' in r) toast.success(`Scanned ${r.scanned}, +${r.addedTotal} new`)
                router.refresh()
              })}
              title="Refresh every active source now"
            >
              <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} /> Refresh all
            </Button>
          ) : null}
          <JobPresetPicker />
          <AddSourceDialog />
        </div>
      </div>

      {tab === 'sources' ? (
        <SourcesTable sources={sources} pending={pending} router={router} start={start} />
      ) : (
        <LeadsTable
          leads={tab === 'new' ? leadsNew : tab === 'saved' ? leadsSaved : leadsArchive}
          sources={sources}
          pending={pending}
          showSaveButton={tab === 'new'}
          status={tab === 'archive' ? 'applied' : tab}
        />
      )}
    </div>
  )
}

/**
 * "X minutes ago" / "X hours ago" / "X days ago" for the per-source
 * last-fetched display. Coarse on purpose — surface-level signal of
 * how stale a source is.
 */
function timeAgo(ms: number | null): string {
  if (!ms) return 'never'
  const diff = Math.max(0, Date.now() - ms)
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function AddSourceDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [keywords, setKeywords] = useState('')
  const [pending, start] = useTransition()
  function submit() {
    start(async () => {
      const r = await addJobSourceAction({ label, url, keywords })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Source added — refresh to pull the first leads')
      setOpen(false); setLabel(''); setUrl(''); setKeywords('')
      router.refresh()
    })
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> Add source</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a job source</DialogTitle>
          <DialogDescription>
            A URL we'll fetch periodically and extract jobs from. HTTPS-only in production; private IPs / loopback / link-local blocked.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="js-label">Label</Label>
            <Input id="js-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Wellfound — PM in Bangalore" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="js-url">URL</Label>
            <Input id="js-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="js-keywords">Keywords (optional, comma-separated)</Label>
            <Input id="js-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="PM, Product Manager, Growth" />
            <p className="text-[11px] text-muted-foreground">Only listings whose title or company match at least one keyword are kept. Leave empty to capture all.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !label.trim() || !url.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourcesTable({
  sources, pending, router, start,
}: {
  sources: SourceRow[]; pending: boolean; router: ReturnType<typeof useRouter>; start: (cb: () => void | Promise<void>) => void
}) {
  const [editing, setEditing] = useState<SourceRow | null>(null)
  if (sources.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No sources yet. Click <strong>Add from preset</strong> or <strong>Add source</strong> above.
      </div>
    )
  }
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="ea-table">
          <thead><tr>
            <th>Source</th>
            <th>Keywords</th>
            <th className="text-right">Leads</th>
            <th>Last status</th>
            <th className="w-48 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={!s.active ? 'opacity-50' : undefined}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.label}</span>
                    {!s.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <Pause className="h-2.5 w-2.5" /> paused
                      </span>
                    ) : null}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                    <span className="truncate max-w-[24rem]">{s.url}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="text-xs text-muted-foreground">{s.keywords || <em>(any)</em>}</td>
                <td className="text-right text-xs font-medium tabular-nums">{s.leadCount}</td>
                <td className="text-xs">
                  {s.lastStatus ? (
                    <span className={`inline-flex items-center gap-1 ${s.lastStatus.startsWith('ok') ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {s.lastStatus.startsWith('ok') ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {s.lastStatus}
                    </span>
                  ) : <span className="text-muted-foreground italic">never run</span>}
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" /> {timeAgo(s.lastFetchedAt)}
                  </div>
                  {s.lastError ? <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{s.lastError}</div> : null}
                </td>
                <td>
                  <div className="ea-row-actions flex justify-end gap-1">
                    <Button size="sm" variant="ghost" disabled={pending}
                      onClick={() => start(async () => {
                        const r = await toggleJobSourceActiveAction(s.id, !s.active)
                        if ('ok' in r && r.ok) toast.success(s.active ? 'Paused' : 'Resumed')
                        router.refresh()
                      })}
                      title={s.active ? 'Pause this source (skipped by cron)' : 'Resume this source'}
                    >{s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Button>
                    <Button size="sm" variant="ghost" disabled={pending}
                      onClick={() => setEditing(s)}
                      title="Edit label / URL / keywords"
                    ><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending}
                      onClick={() => start(async () => {
                        const r = await refreshJobSourceAction(s.id)
                        if ('error' in r && r.error) toast.error(r.error)
                        else toast.success('added' in r && r.added > 0 ? `+${r.added} new leads` : 'No new leads')
                        router.refresh()
                      })}
                      title="Refresh now"
                    ><RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} /></Button>
                    <Button size="sm" variant="ghost" disabled={pending}
                      onClick={() => start(async () => {
                        if (!confirm(`Delete source "${s.label}"? Its leads stay.`)) return
                        await deleteJobSourceAction(s.id)
                        toast.success('Source deleted')
                        router.refresh()
                      })}
                      title="Delete source"
                    ><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EditSourceDialog source={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function EditSourceDialog({ source, onClose }: { source: SourceRow | null; onClose: () => void }) {
  const router = useRouter()
  const [label, setLabel] = useState(source?.label ?? '')
  const [url, setUrl] = useState(source?.url ?? '')
  const [keywords, setKeywords] = useState(source?.keywords ?? '')
  const [pending, start] = useTransition()
  // Re-seed local state every time the dialog mounts with a different
  // source row. The previous version used a useState lazy initializer
  // here, which only fires once — opening the dialog on row B after
  // editing row A showed row A's stale values.
  useEffect(() => {
    if (source) { setLabel(source.label); setUrl(source.url); setKeywords(source.keywords) }
  }, [source])
  if (!source) return null
  function submit() {
    if (!source) return
    start(async () => {
      const r = await editJobSourceAction(source.id, { label, url, keywords })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Saved')
      onClose()
      router.refresh()
    })
  }
  return (
    <Dialog open={Boolean(source)} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit source</DialogTitle>
          <DialogDescription>
            Changing the URL re-runs the SSRF guard before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="es-label">Label</Label>
            <Input id="es-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="es-url">URL</Label>
            <Input id="es-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="es-kw">Keywords (comma-separated)</Label>
            <Input id="es-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="PM, Product Manager" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !label.trim() || !url.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LeadsTable({
  leads, sources, pending, showSaveButton, status,
}: {
  leads: LeadRow[]; sources: SourceRow[]; pending: boolean; showSaveButton: boolean
  status: 'new' | 'saved' | 'applied'
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [q, setQ] = useState('')
  // Per-source filter — null = all sources. Lets the user drill into
  // leads from one board without leaving the page.
  const [sourceFilter, setSourceFilter] = useState<number | null>(null)
  // Per-row selection for bulk triage. Cleared whenever the source
  // list changes (router.refresh after a status change re-mounts the
  // table because the `leads` prop changes).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Client-side filter — cheap because we already cap server-side at
  // 200. Matches title + company + location with a substring search,
  // then optionally narrows by source.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = leads
    if (sourceFilter != null) out = out.filter((l) => l.sourceId === sourceFilter)
    if (!needle) return out
    return out.filter((l) => (
      l.title.toLowerCase().includes(needle) ||
      l.company.toLowerCase().includes(needle) ||
      l.location.toLowerCase().includes(needle)
    ))
  }, [leads, q, sourceFilter])
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id))
  function bulk(next: 'saved' | 'ignored' | 'applied') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    start(async () => {
      const r = await bulkSetJobLeadStatusAction(ids, next)
      if ('error' in r && r.error) { toast.error(r.error); return }
      if ('updated' in r) toast.success(`Marked ${r.updated} as ${next}`)
      setSelected(new Set())
      router.refresh()
    })
  }

  function setStatus(id: number, next: 'saved' | 'ignored' | 'applied') {
    start(async () => {
      await setJobLeadStatusAction(id, next)
      toast.success(`Marked ${next}`)
      router.refresh()
    })
  }

  function convertToDraft(id: number) {
    start(async () => {
      const r = await leadToDraftAction(id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Draft created — finish it in /drafts')
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / company / location…" className="pl-8 h-9 text-sm" />
        </div>
        {sources.length > 1 ? (
          <select
            value={sourceFilter ?? ''}
            onChange={(e) => setSourceFilter(e.target.value === '' ? null : Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-xs"
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        ) : null}
        <div className="text-xs text-muted-foreground">{filtered.length} of {leads.length} {leads.length === 1 ? 'lead' : 'leads'}</div>
        <Button variant="outline" size="sm" asChild className="ml-auto">
          <a href={`/api/jobs/export?status=${status}`} download>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </a>
        </Button>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          {showSaveButton ? (
            <Button size="sm" variant="outline" disabled={busy || pending} onClick={() => bulk('saved')}>
              <Bookmark className="mr-1 h-3 w-3" /> Save all
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={busy || pending} onClick={() => bulk('applied')}>Mark all applied</Button>
          <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => bulk('ignored')}>Ignore all</Button>
          <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => setSelected(new Set())} className="ml-auto">Clear selection</Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">
          {leads.length === 0
            ? 'No leads here yet. Refresh a source to pull listings.'
            : `No leads match "${q}".`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="ea-table">
            <thead><tr>
              <th className="w-8">
                <input
                  type="checkbox" aria-label="Select all visible"
                  checked={allSelected}
                  onChange={(e) => {
                    const n = new Set(selected)
                    if (e.target.checked) for (const l of filtered) n.add(l.id)
                    else for (const l of filtered) n.delete(l.id)
                    setSelected(n)
                  }}
                />
              </th>
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Seen</th>
              <th className="w-64 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((l) => {
                const src = sourceById.get(l.sourceId)
                return (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox" aria-label={`Select ${l.title}`}
                      checked={selected.has(l.id)}
                      onChange={(e) => {
                        const n = new Set(selected)
                        if (e.target.checked) n.add(l.id); else n.delete(l.id)
                        setSelected(n)
                      }}
                    />
                  </td>
                  <td>
                    {l.link ? (
                      <a href={l.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                        {l.title} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="font-medium">{l.title}</span>}
                    {src ? (
                      <div className="text-[10px] text-muted-foreground">via {src.label}</div>
                    ) : null}
                  </td>
                  <td className="text-xs text-muted-foreground">{l.company || '—'}</td>
                  <td className="text-xs text-muted-foreground">{l.location || '—'}</td>
                  <td className="text-xs text-muted-foreground">{new Date(l.seenAt).toLocaleDateString()}</td>
                  <td>
                    <div className="ea-row-actions flex justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={busy || pending} onClick={() => convertToDraft(l.id)}
                        title="Create a draft outreach email + contact for this lead">
                        <MailPlus className="mr-1 h-3 w-3" /> Draft
                      </Button>
                      {showSaveButton ? (
                        <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => setStatus(l.id, 'saved')}
                          title="Save for later">
                          <Bookmark className="mr-1 h-3 w-3" /> Save
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => setStatus(l.id, 'applied')}
                        title="Mark as applied">
                        Applied
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => setStatus(l.id, 'ignored')}
                        title="Ignore">
                        Ignore
                      </Button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
