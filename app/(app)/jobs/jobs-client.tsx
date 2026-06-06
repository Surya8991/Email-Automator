'use client'
import { useMemo, useState, useTransition } from 'react'
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
  editJobSourceAction, refreshAllForUserAction, validateJobSourceAction,
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
  postedAt: Date | null; salary: string; description: string
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

type ValidationResult = {
  ok: boolean; total: number; error?: string
  sample: Array<{ title: string; company: string; location: string; salary: string }>
}

const SOURCE_EXAMPLES = [
  {
    label: 'Naukri — SEO Bangalore',
    url: 'https://www.naukri.com/seo-jobs-in-bangalore',
    keywords: 'SEO',
    note: 'Naukri JSON API — structured, 500 jobs on first fetch',
    tag: 'Naukri',
  },
  {
    label: 'Naukri — Performance Marketing Hyderabad',
    url: 'https://www.naukri.com/performance-marketing-jobs-in-hyderabad',
    keywords: 'Performance Marketing',
    note: 'Change city slug: -jobs-in-mumbai, -jobs-in-chennai, etc.',
    tag: 'Naukri',
  },
  {
    label: 'Indeed India — Paid Media Bangalore (RSS)',
    url: 'https://in.indeed.com/rss?q=paid+media&l=Bangalore',
    keywords: '',
    note: 'RSS feed — no bot blocking, real-time postings',
    tag: 'Indeed',
  },
  {
    label: 'Indeed India — Digital Marketing Mumbai (RSS)',
    url: 'https://in.indeed.com/rss?q=digital+marketing&l=Mumbai',
    keywords: '',
    note: 'Swap q= and l= for any role + city',
    tag: 'Indeed',
  },
  {
    label: 'Wellfound — Growth India',
    url: 'https://wellfound.com/jobs?role=growth&location=india',
    keywords: 'Growth, Marketing',
    note: 'Startup equity roles — AI-extracted from HTML',
    tag: 'Startup',
  },
  {
    label: 'Remote OK — SEO (JSON API)',
    url: 'https://remoteok.com/api?tags=seo',
    keywords: '',
    note: 'Public JSON API — global remote roles, fast',
    tag: 'Remote',
  },
  {
    label: 'Greenhouse company board',
    url: 'https://boards.greenhouse.io/notion',
    keywords: 'Marketing, Content, SEO',
    note: 'Replace /notion with any company slug',
    tag: 'Company',
  },
]

function AddSourceDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [keywords, setKeywords] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, start] = useTransition()
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [showExamples, setShowExamples] = useState(true)

  function reset() { setLabel(''); setUrl(''); setKeywords(''); setNotes(''); setValidation(null); setShowExamples(true) }

  function applyExample(ex: typeof SOURCE_EXAMPLES[number]) {
    setUrl(ex.url); setKeywords(ex.keywords); setLabel(ex.label); setValidation(null); setShowExamples(false)
  }

  async function testSource() {
    if (!url.trim()) { toast.error('Enter a URL first'); return }
    setValidating(true); setValidation(null)
    const r = await validateJobSourceAction(url.trim(), keywords.trim())
    setValidating(false)
    if ('error' in r && r.error) { setValidation({ ok: false, total: 0, error: r.error, sample: [] }); return }
    if ('ok' in r) setValidation({ ok: true, total: r.total ?? 0, sample: r.sample ?? [], error: undefined })
  }

  function submit() {
    start(async () => {
      const r = await addJobSourceAction({ label: label.trim() || url, url, keywords })
      if ('error' in r && r.error) { toast.error(r.error); return }
      const n = ('added' in r && typeof r.added === 'number') ? r.added : 0
      toast.success(
        n > 0
          ? `Source added — ${n} job${n === 1 ? '' : 's'} pulled immediately.`
          : 'Source added — jobs will appear after the first fetch.'
      )
      setOpen(false); reset(); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> Add source</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a job source</DialogTitle>
          <DialogDescription>
            Paste a job-board search URL or company careers page. We'll fetch it periodically and AI-extract new listings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Examples panel */}
          <div className="rounded-md border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowExamples((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground ea-transition"
            >
              <span>Examples — click any to pre-fill</span>
              <span className="text-[10px]">{showExamples ? '▲ hide' : '▼ show'}</span>
            </button>
            {showExamples ? (
              <div className="grid gap-1.5 px-3 pb-3 sm:grid-cols-2">
                {SOURCE_EXAMPLES.map((ex) => (
                  <button
                    key={ex.url} type="button" onClick={() => applyExample(ex)}
                    className="flex flex-col items-start rounded-md border bg-background px-2.5 py-2 text-left ea-transition hover:border-primary/40 hover:bg-accent/20"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                        {ex.tag}
                      </span>
                      <span className="truncate text-xs font-medium">{ex.label}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{ex.note}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="js-url">Board / careers URL <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                id="js-url" type="url" value={url}
                onChange={(e) => { setUrl(e.target.value); setValidation(null) }}
                placeholder="https://www.naukri.com/seo-jobs-in-bangalore"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" disabled={validating || !url.trim()} onClick={testSource}>
                {validating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">HTTPS only in production. Naukri, LinkedIn, Wellfound, Greenhouse, Lever, and company careers pages all work.</p>
          </div>

          {/* Validation result */}
          {validation ? (
            <div className={`rounded-md border p-3 text-xs ${validation.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/30 bg-destructive/10'}`}>
              {validation.ok ? (
                <>
                  <div className="mb-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                    ✓ Reachable — found {validation.total} job{validation.total !== 1 ? 's' : ''} matching your keywords
                  </div>
                  {validation.sample.map((j, i) => (
                    <div key={i} className="py-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{j.title}</span>
                      {j.company ? ` · ${j.company}` : ''}
                      {j.location ? ` · ${j.location}` : ''}
                      {j.salary ? ` · ${j.salary}` : ''}
                    </div>
                  ))}
                  {validation.total === 0 ? (
                    <div className="text-amber-600 dark:text-amber-400">No listings found — try broadening your keywords or check if the board is publicly accessible.</div>
                  ) : null}
                </>
              ) : (
                <div className="text-destructive">{validation.error}</div>
              )}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="js-label">Label <span className="text-muted-foreground text-[11px]">(auto-filled from URL if blank)</span></Label>
            <Input id="js-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Naukri — SEO Bangalore" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="js-keywords">Keywords <span className="text-muted-foreground text-[11px]">(comma-separated, optional)</span></Label>
            <Input id="js-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="SEO, Performance Marketing, Paid Media" />
            <p className="text-[11px] text-muted-foreground">Only listings whose title or company contain at least one keyword are kept. Leave empty to capture everything.</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="js-notes">Notes <span className="text-muted-foreground text-[11px]">(optional — for your own reference)</span></Label>
            <Input id="js-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Best for mid-level IN roles, check weekly" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !url.trim()}>
            {pending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Add &amp; fetch
          </Button>
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
      {editing ? (
        // key={editing.id} forces a fresh mount per row so the lazy
        // useState initializers re-seed cleanly — avoids the React 19
        // "setState in effect" lint while keeping per-row freshness.
        <EditSourceDialog key={editing.id} source={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  )
}

function EditSourceDialog({ source, onClose }: { source: SourceRow; onClose: () => void }) {
  const router = useRouter()
  // Lazy initializers run once per mount; the parent re-mounts this
  // component with key={source.id} when the row changes, so we get
  // fresh-seeded state per row without needing an effect.
  const [label, setLabel] = useState(source.label)
  const [url, setUrl] = useState(source.url)
  const [keywords, setKeywords] = useState(source.keywords)
  const [pending, start] = useTransition()
  function submit() {
    start(async () => {
      const r = await editJobSourceAction(source.id, { label, url, keywords })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Saved')
      onClose()
      router.refresh()
    })
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
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
  const [sourceFilter, setSourceFilter] = useState<number | null>(null)
  const [companyFilter, setCompanyFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const companies = useMemo(() =>
    [...new Set(leads.map((l) => l.company).filter(Boolean))].sort(), [leads])
  const locations = useMemo(() =>
    [...new Set(leads.map((l) => l.location).filter(Boolean))].sort(), [leads])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = leads
    if (sourceFilter != null) out = out.filter((l) => l.sourceId === sourceFilter)
    if (companyFilter) out = out.filter((l) => l.company === companyFilter)
    if (locationFilter) out = out.filter((l) => l.location === locationFilter)
    if (!needle) return out
    return out.filter((l) => (
      l.title.toLowerCase().includes(needle) ||
      l.company.toLowerCase().includes(needle) ||
      l.location.toLowerCase().includes(needle) ||
      l.salary.toLowerCase().includes(needle) ||
      l.description.toLowerCase().includes(needle)
    ))
  }, [leads, q, sourceFilter, companyFilter, locationFilter])
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
      toast.success('Draft created. Finish it in /drafts.')
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
        {companies.length > 1 ? (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-xs"
            aria-label="Filter by company"
          >
            <option value="">All companies</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        {locations.length > 1 ? (
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-xs"
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
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
              <th>Salary</th>
              <th>Posted</th>
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
                    {l.description ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{l.description}</div>
                    ) : null}
                    {src ? (
                      <div className="text-[10px] text-muted-foreground">via {src.label}</div>
                    ) : null}
                  </td>
                  <td className="text-xs text-muted-foreground">{l.company || '–'}</td>
                  <td className="text-xs text-muted-foreground">{l.location || '–'}</td>
                  <td className="text-xs text-muted-foreground">{l.salary || '–'}</td>
                  <td className="text-xs text-muted-foreground">
                    {l.postedAt ? new Date(l.postedAt).toLocaleDateString() : '–'}
                  </td>
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
