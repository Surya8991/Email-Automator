'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, RefreshCw, Trash2, ExternalLink, Bookmark, Briefcase, CheckCircle2, XCircle, Building2,
  Search, Download, MailPlus, Pause, Play, Pencil, RefreshCcw, Archive, Clock,
  MapPin, IndianRupee, CalendarDays, Tag, Eye, AlertTriangle, Zap, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  addJobSourceAction, deleteJobSourceAction, deleteAllJobSourcesAction,
  bulkDeleteJobSourcesAction, bulkToggleSourceActiveAction,
  refreshJobSourceAction, setJobLeadStatusAction,
  leadToDraftAction, bulkSetJobLeadStatusAction, toggleJobSourceActiveAction,
  editJobSourceAction, validateJobSourceAction,
  getActiveSourcesAction, tickSingleSourceAction,
  getLeadsWithLinksAction, checkLinksBatchAction,
  deleteJobLeadAction, bulkDeleteJobLeadsAction,
} from '@/server/actions/job-tracker'
import { JobPresetPicker } from './preset-picker'

interface SourceRow {
  id: number; label: string; url: string; keywords: string; active: boolean
  lastFetchedAt: number | null; lastStatus: string; lastError: string
  leadCount: number
  /** Adapter name from server (e.g. 'greenhouse', 'lever', 'ashby', 'naukri',
   *  'remote-ok', 'adzuna'). Empty string means no dedicated adapter — the
   *  source falls through to JSON-LD / AI extraction. */
  adapter: string
}
interface LeadRow {
  id: number; title: string; company: string; link: string; location: string
  status: string; sourceId: number; seenAt: Date
  postedAt: Date | null; salary: string; description: string
  // Normalized fields (populated by tickSource via normalize.ts).
  salaryMin: number | null; salaryMax: number | null
  salaryCcy: string; salaryPeriod: string
  locationNorm: string; remoteScope: string
  crossKey: string
}

interface RunProgress {
  label: string    // "Fetch new" | "Full refresh" | "Fix 404s"
  phase: string    // current step description shown under the bar
  total: number
  done: number
  stat: string     // "+12 new" | "8 expired found"
}

export function JobsClient({
  sources, leadsNew, leadsSaved, leadsApplied, leadsIgnored, leadsArchive,
}: {
  sources: SourceRow[]; leadsNew: LeadRow[]; leadsSaved: LeadRow[]
  leadsApplied: LeadRow[]; leadsIgnored: LeadRow[]
  /** Kept for back-compat with any external embed; the in-component
   *  archive view now uses leadsApplied + leadsIgnored independently. */
  leadsArchive: LeadRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'new' | 'saved' | 'archive' | 'sources'>(sources.length === 0 ? 'sources' : 'new')
  // Sub-tab inside the Archive view — split Applied vs Ignored so
  // outreach analytics stays separate from "I'm not interested" piles.
  const [archiveSub, setArchiveSub] = useState<'applied' | 'ignored'>('applied')
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const running = progress !== null

  // ── Orchestrated actions ─────────────────────────────────────────────────
  async function runFetchNew() {
    const { sources: srcs } = await getActiveSourcesAction()
    if (!srcs.length) { toast.info('No active sources'); return }
    let added = 0, failed = 0
    setProgress({ label: 'Fetch new', phase: 'Starting…', total: srcs.length, done: 0, stat: '+0 new' })
    try {
      for (const s of srcs) {
        setProgress((p) => p && { ...p, phase: `Fetching "${s.label}"…` })
        const r = await tickSingleSourceAction(s.id, false)
        added += r.added ?? 0
        if (r.status === 'error' || r.status === 'rate-limited') failed++
        setProgress((p) => p && { ...p, done: p.done + 1, stat: `+${added} new${failed ? ` · ${failed} failed` : ''}` })
      }
      const msg = `+${added} new lead${added === 1 ? '' : 's'} from ${srcs.length} source${srcs.length === 1 ? '' : 's'}`
      if (failed) toast.warning(`${msg} · ${failed} failed`)
      else toast.success(msg)
      router.refresh()
    } finally {
      setProgress(null)
    }
  }

  async function runFullRefresh() {
    const { sources: srcs } = await getActiveSourcesAction()
    if (!srcs.length) { toast.info('No active sources'); return }
    let added = 0, failed = 0
    setProgress({ label: 'Full refresh', phase: 'Starting…', total: srcs.length, done: 0, stat: '+0 new' })
    try {
      for (const s of srcs) {
        setProgress((p) => p && { ...p, phase: `Refreshing "${s.label}"…` })
        const r = await tickSingleSourceAction(s.id, true)
        added += r.added ?? 0
        if (r.status === 'error' || r.status === 'rate-limited') failed++
        setProgress((p) => p && { ...p, done: p.done + 1, stat: `+${added} new${failed ? ` · ${failed} failed` : ' · enriching…'}` })
      }
      const msg = `Full refresh done · ${srcs.length} sources · +${added} new leads`
      if (failed) toast.warning(`${msg} · ${failed} failed`)
      else toast.success(`${msg} · existing leads enriched`)
      router.refresh()
    } finally {
      setProgress(null)
    }
  }

  async function runFix404s() {
    const { leads } = await getLeadsWithLinksAction()
    if (!leads.length) { toast.info('No leads with links to check'); return }
    const BATCH = 20
    let dead = 0
    setProgress({ label: 'Fix 404s', phase: 'Checking links…', total: leads.length, done: 0, stat: '0 expired' })
    try {
      for (let i = 0; i < leads.length; i += BATCH) {
        const batch = leads.slice(i, i + BATCH).map((l) => l.id)
        const r = await checkLinksBatchAction(batch)
        dead += r.dead ?? 0
        setProgress((p) => p && { ...p, done: Math.min(i + BATCH, leads.length), stat: `${dead} expired` })
      }
      if (dead === 0) toast.success(`All ${leads.length} links alive`)
      else toast.warning(`Removed ${dead} expired listing${dead === 1 ? '' : 's'} · ${leads.length} checked`)
      router.refresh()
    } finally {
      setProgress(null)
    }
  }

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
            <div className="flex items-center divide-x rounded-md border bg-background overflow-hidden">
              <button
                disabled={running || pending}
                onClick={runFetchNew}
                title="Quick pull — fetches only new listings (up to 100 per source). Fast."
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-muted ea-transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className={`h-3.5 w-3.5 text-primary ${running && progress?.label === 'Fetch new' ? 'animate-pulse' : ''}`} />
                Fetch new
              </button>
              <button
                disabled={running || pending}
                onClick={runFullRefresh}
                title="Full refresh — resets page budget to 500 results, re-fetches every source, enriches existing leads."
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-muted ea-transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${running && progress?.label === 'Full refresh' ? 'animate-spin' : ''}`} />
                Full refresh
              </button>
              <button
                disabled={running || pending}
                onClick={runFix404s}
                title="Fix 404s — checks every new/saved lead link and auto-ignores expired listings."
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 ea-transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AlertTriangle className={`h-3.5 w-3.5 ${running && progress?.label === 'Fix 404s' ? 'animate-pulse' : ''}`} />
                Fix 404s
              </button>
            </div>
          ) : null}
          <JobPresetPicker />
          <AddSourceDialog />
        </div>
      </div>

      {/* ── Live progress bar ── */}
      {progress ? (
        <div className="rounded-lg border bg-card px-4 py-3 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{progress.label}</span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {progress.done} / {progress.total} &nbsp;·&nbsp; {progress.stat}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground truncate">{progress.phase}</p>
        </div>
      ) : null}

      {tab === 'sources' ? (
        <SourcesTable sources={sources} pending={pending} router={router} start={start} />
      ) : tab === 'archive' ? (
        <div className="space-y-3">
          {/* Applied vs Ignored sub-tabs — keep outreach analytics
              separate from the "not interested" bucket so each can be
              triaged + restored independently. */}
          <div className="flex items-center gap-2">
            <Segmented<'applied' | 'ignored'>
              value={archiveSub}
              onChange={setArchiveSub}
              ariaLabel="Archive view"
              options={[
                { value: 'applied', label: `Applied (${leadsApplied.length})`, icon: CheckCircle2 },
                { value: 'ignored', label: `Ignored (${leadsIgnored.length})`, icon: XCircle },
              ]}
            />
            <span className="text-xs text-muted-foreground">
              Use Restore on any row to move it back to New or Saved.
            </span>
          </div>
          <LeadsTable
            leads={archiveSub === 'applied' ? leadsApplied : leadsIgnored}
            sources={sources}
            pending={pending}
            showSaveButton={false}
            status={archiveSub}
          />
        </div>
      ) : (
        <LeadsTable
          leads={tab === 'new' ? leadsNew : leadsSaved}
          sources={sources}
          pending={pending}
          showSaveButton={tab === 'new'}
          status={tab}
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
    label: 'Indeed India — Paid Media Bangalore',
    url: 'https://in.indeed.com/jobs?q=paid+media&l=Bangalore',
    keywords: '',
    note: 'AI-extracted from HTML — broad volume, no login needed',
    tag: 'Indeed',
  },
  {
    label: 'Indeed India — Digital Marketing Mumbai',
    url: 'https://in.indeed.com/jobs?q=digital+marketing&l=Mumbai',
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
  const [pending, start] = useTransition()
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [showExamples, setShowExamples] = useState(true)

  function reset() { setLabel(''); setUrl(''); setKeywords(''); setValidation(null); setShowExamples(true) }

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
      const r = await addJobSourceAction({ label: label.trim() || url.trim(), url: url.trim(), keywords })
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [refreshingId, setRefreshingId] = useState<number | null>(null)

  const allSelected = sources.length > 0 && sources.every((s) => selected.has(s.id))

  function toggleSelect(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sources.map((s) => s.id)))
  }

  function deleteOne(id: number) {
    start(async () => {
      await deleteJobSourceAction(id)
      setConfirmDeleteId(null)
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
      toast.success('Source deleted')
      router.refresh()
    })
  }

  function deleteSelected() {
    const ids = Array.from(selected)
    start(async () => {
      const r = await bulkDeleteJobSourcesAction(ids)
      setSelected(new Set())
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(`${'deleted' in r ? r.deleted : ids.length} source${ids.length === 1 ? '' : 's'} deleted`)
      router.refresh()
    })
  }

  function deleteAll() {
    start(async () => {
      const r = await deleteAllJobSourcesAction()
      setConfirmDeleteAll(false)
      setSelected(new Set())
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Deleted ${'deleted' in r ? r.deleted : 'all'} sources`)
      router.refresh()
    })
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No sources yet. Click <strong>Add from preset</strong> or <strong>Add source</strong> above.
      </div>
    )
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => {
              const r = await bulkToggleSourceActiveAction(Array.from(selected), true)
              setSelected(new Set())
              if ('error' in r && r.error) { toast.error(r.error); return }
              toast.success('Resumed'); router.refresh()
            })}>Resume selected</Button>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => {
              const r = await bulkToggleSourceActiveAction(Array.from(selected), false)
              setSelected(new Set())
              if ('error' in r && r.error) { toast.error(r.error); return }
              toast.success('Paused'); router.refresh()
            })}>Pause selected</Button>
          <Button size="sm" variant="ghost" disabled={pending}
            className="text-destructive hover:text-destructive"
            onClick={deleteSelected}>Delete selected</Button>
          <Button size="sm" variant="ghost" disabled={pending}
            onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      ) : null}

      {/* Delete-all confirm banner */}
      {confirmDeleteAll ? (
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <span className="font-medium text-destructive">Delete all {sources.length} sources? This cannot be undone.</span>
          <Button size="sm" variant="destructive" disabled={pending} onClick={deleteAll}>Yes, delete all</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteAll(false)}>Cancel</Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="ea-table">
          <thead><tr>
            <th className="w-8">
              <input type="checkbox" aria-label="Select all" checked={allSelected}
                onChange={toggleAll} />
            </th>
            <th>Source</th>
            <th>Keywords</th>
            <th className="text-right">Leads</th>
            <th>Last fetch</th>
            <th className="w-44 text-right">
              <button
                className="text-[10px] font-normal text-destructive/70 hover:text-destructive ea-transition"
                onClick={() => setConfirmDeleteAll(true)}
                title="Delete all sources"
              >Delete all</button>
            </th>
          </tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={!s.active ? 'opacity-55' : undefined}>
                <td>
                  <input type="checkbox" aria-label={`Select ${s.label}`}
                    checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                </td>
                <td>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.label}</span>
                    {!s.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <Pause className="h-2.5 w-2.5" /> paused
                      </span>
                    ) : null}
                    {/* Adapter badge: which fetcher this source uses. Green for
                        zero-AI-cost adapters; amber for AI-fallback sources so
                        the operator sees at a glance which sources burn Groq
                        tokens on every tick. */}
                    {s.adapter ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                            title={`Fetched via dedicated adapter — no AI extraction cost.`}>
                        ⚡ {s.adapter}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                            title="No dedicated adapter — falls through to JSON-LD then AI extraction. Costlier per tick.">
                        AI fallback
                      </span>
                    )}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                    <span className="truncate max-w-[22rem]">{s.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </td>
                <td className="text-xs text-muted-foreground">{s.keywords || <em>(any)</em>}</td>
                <td className="text-right text-xs font-medium tabular-nums">{s.leadCount}</td>
                <td className="text-xs">
                  {s.lastStatus ? (() => {
                    const isOk = s.lastStatus.startsWith('ok')
                    const isHardError = s.lastStatus === 'error'
                    const colorCls = isOk
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isHardError
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    return (
                      <span className={`inline-flex items-center gap-1 ${colorCls}`}>
                        {isOk ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                        <span className="truncate max-w-[12rem]">{s.lastStatus}</span>
                      </span>
                    )
                  })() : <span className="italic text-muted-foreground">never run</span>}
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5 shrink-0" /> {timeAgo(s.lastFetchedAt)}
                  </div>
                  {s.lastError ? (
                    <div className="mt-0.5 truncate text-[11px] text-red-600 dark:text-red-400 max-w-[18rem]" title={s.lastError}>{s.lastError}</div>
                  ) : null}
                </td>
                <td>
                  {confirmDeleteId === s.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground">Delete?</span>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => deleteOne(s.id)}>Yes</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>No</Button>
                    </div>
                  ) : (
                    <div className="ea-row-actions flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={pending}
                        onClick={() => start(async () => {
                          const r = await toggleJobSourceActiveAction(s.id, !s.active)
                          if ('ok' in r && r.ok) toast.success(s.active ? 'Paused' : 'Resumed')
                          router.refresh()
                        })}
                        title={s.active ? 'Pause (skip in cron)' : 'Resume'}
                        aria-label={s.active ? 'Pause source' : 'Resume source'}
                      >{s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Button>
                      <Button size="sm" variant="ghost" disabled={pending}
                        onClick={() => setEditing(s)} title="Edit label / URL / keywords"
                        aria-label="Edit source"
                      ><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" disabled={pending || refreshingId === s.id}
                        onClick={() => {
                          setRefreshingId(s.id)
                          start(async () => {
                            const r = await refreshJobSourceAction(s.id)
                            setRefreshingId(null)
                            if ('error' in r && r.error) toast.error(r.error)
                            else toast.success('added' in r && r.added > 0 ? `+${r.added} new leads` : 'No new leads')
                            router.refresh()
                          })
                        }}
                        title="Refresh now"
                        aria-label="Refresh source now"
                      ><RefreshCw className={`h-3.5 w-3.5 ${refreshingId === s.id ? 'animate-spin' : ''}`} /></Button>
                      <Button size="sm" variant="ghost" disabled={pending}
                        onClick={() => setConfirmDeleteId(s.id)} title="Delete source"
                        aria-label="Delete source"
                      ><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
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

// ── Job Detail Dialog ────────────────────────────────────────────────────────
function JobDetailDialog({
  lead, src, open, onClose, onDraft, onStatus, busy,
}: {
  lead: LeadRow; src: SourceRow | undefined
  open: boolean; onClose: () => void
  onDraft: (id: number) => void
  onStatus: (id: number, s: 'saved' | 'ignored' | 'applied') => void
  busy: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl leading-snug pr-6">{lead.title}</DialogTitle>
          {/* Meta line under title */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
            {lead.company ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Building2 className="h-4 w-4 shrink-0" /> {lead.company}
              </span>
            ) : null}
            {lead.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {lead.location}
              </span>
            ) : null}
            {lead.salary ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <IndianRupee className="h-3.5 w-3.5 shrink-0" /> {lead.salary}
              </span>
            ) : null}
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Full JD */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job Description</h3>
            {lead.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{decodeEntities(lead.description)}</p>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No description extracted.{lead.link ? (
                  <> <a href={lead.link} target="_blank" rel="noreferrer" className="ml-1 text-primary underline underline-offset-2">Open the original listing</a> for the full JD.</>
                ) : ' Open the original listing for the full JD.'}
              </div>
            )}
          </section>

          {/* Detail grid */}
          <section className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
            {lead.company ? (
              <div>
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Company</dt>
                <dd className="font-medium">{lead.company}</dd>
              </div>
            ) : null}
            {lead.location ? (
              <div>
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location</dt>
                <dd>{lead.location}</dd>
              </div>
            ) : null}
            {lead.salary ? (
              <div>
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Salary / CTC</dt>
                <dd className="font-semibold text-emerald-600 dark:text-emerald-400">{lead.salary}</dd>
              </div>
            ) : null}
            {lead.postedAt ? (
              <div>
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Posted</dt>
                <dd>{new Date(lead.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              </div>
            ) : null}
            <div>
              <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Seen on</dt>
              <dd>{new Date(lead.seenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </div>
            {src ? (
              <div>
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source</dt>
                <dd>
                  <a href={src.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline">
                    {src.label} <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
            ) : null}
            {lead.link ? (
              <div className="col-span-2 sm:col-span-1">
                <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Original listing</dt>
                <dd>
                  <a href={lead.link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                    View full JD <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </dd>
              </div>
            ) : null}
          </section>
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t pt-4">
          {lead.link ? (
            <Button variant="outline" asChild className="mr-auto">
              <a href={lead.link} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" /> View job posting
              </a>
            </Button>
          ) : null}
          <Button variant="default" disabled={busy} onClick={() => { onDraft(lead.id); onClose() }}>
            <MailPlus className="mr-1.5 h-4 w-4" /> Draft outreach email
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => { onStatus(lead.id, 'saved'); onClose() }}>
            <Bookmark className="mr-1.5 h-4 w-4" /> Save lead
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => { onStatus(lead.id, 'applied'); onClose() }}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark applied
          </Button>
          <Button variant="ghost" disabled={busy} className="text-muted-foreground"
            onClick={() => { onStatus(lead.id, 'ignored'); onClose() }}>
            <XCircle className="mr-1.5 h-4 w-4" /> Ignore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Rough currency → INR multipliers for the min-salary filter.
// Right ballpark, not market-accurate; the filter is for "show me roles
// above X" not for portfolio reporting.
const CCY_TO_INR: Record<string, number> = { INR: 1, USD: 84, EUR: 90, GBP: 105 }

// ── Marketing role classifier ─────────────────────────────────────────────────
// Used to split leads into "Marketing / DM" vs "Others" so engineering /
// ops roles that slip through company-wide ATS feeds don't pollute the view.
const MARKETING_TITLE_RE = /\b(seo|sem|ppc|cpc|search engine|digital market|performance market|growth market|growth hack|content market|brand market|social media|email market|affiliate|programmatic|google ads|facebook ads|meta ads|paid media|paid social|paid search|demand gen|product market|marketing analyst|marketing manager|marketing executive|marketing specialist|marketing lead|marketing head|marketing director|marketing vp|marketing assoc|campaign manager|campaign execut|media planner|media buyer|media manager|community manager|influencer|pr manager|public relation|communications manager|inbound market|outbound market|marketing ops|marketing operat|martech|seo execut|seo analyst|seo manager|seo specialist|seo lead|seo head|seo strategist|sem manager|sem execut|digital marketer|e-commerce market|ecommerce market|performance execut|marketing data|growth execut|growth analyst|growth associate|growth manager|growth lead|crm market|retention market|lifecycle market|user acqui|acquisition market|conversion rate|cro specialist)/i

export function isMarketingRole(title: string): boolean {
  return MARKETING_TITLE_RE.test(title)
}

const SALARY_PRESETS = [
  { label: 'Any', value: 0 },
  { label: '5L+', value: 500_000 },
  { label: '8L+', value: 800_000 },
  { label: '10L+', value: 1_000_000 },
  { label: '15L+', value: 1_500_000 },
  { label: '20L+', value: 2_000_000 },
]

/** Decode HTML entities in descriptions stored before the stripHtml fix. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Leads Table ──────────────────────────────────────────────────────────────
function LeadsTable({
  leads, sources, pending, showSaveButton, status,
}: {
  leads: LeadRow[]; sources: SourceRow[]; pending: boolean; showSaveButton: boolean
  status: 'new' | 'saved' | 'applied' | 'ignored'
}) {
  // Restore-available view = archived lead (applied or ignored) → user
  // can bounce it back to New or Saved. Keeps the bulk + per-row toolbar
  // unified regardless of which archive sub-tab we're in.
  const isArchived = status === 'applied' || status === 'ignored'
  const router = useRouter()
  const [busy, start] = useTransition()
  const [q, setQ] = useState('')
  const [sourceFilter, setSourceFilter] = useState<number | null>(null)
  const [companyFilter, setCompanyFilter] = useState('')
  const [normLocFilter, setNormLocFilter] = useState('')   // uses locationNorm (normalized city)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'company' | 'salary'>('newest')
  // 'all' | 'marketing' | 'other' — splits leads by role category.
  const [roleFilter, setRoleFilter] = useState<'all' | 'marketing' | 'other'>('all')
  // Remote-scope multi-select chip filter. Empty set = "any" (don't filter).
  const [remoteScopes, setRemoteScopes] = useState<Set<string>>(new Set())
  // Min-salary filter in INR-equivalent (rough). 0 = no filter.
  const [minSalary, setMinSalary] = useState<number>(0)
  // Posted-within filter. 'any' = no cutoff.
  const [postedWithin, setPostedWithin] = useState<'any' | '7d' | '30d' | '60d'>('any')
  // Show / hide the secondary filter row.
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100
  // Per-row + bulk delete confirmation state (no browser confirm()).
  const [confirmDeleteLeadId, setConfirmDeleteLeadId] = useState<number | null>(null)
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState(false)

  const companies = useMemo(() =>
    [...new Set(leads.map((l) => l.company).filter(Boolean))].sort(), [leads])
  // Normalized city list (deduplicated). Shown as capitalized labels.
  const normLocations = useMemo(() =>
    [...new Set(leads.map((l) => l.locationNorm).filter(Boolean))].sort(), [leads])
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null)

  // Count of active secondary filters (for the badge on the Filters toggle).
  const activeFilterCount =
    (companyFilter ? 1 : 0) +
    (normLocFilter ? 1 : 0) +
    remoteScopes.size +
    (minSalary > 0 ? 1 : 0) +
    (postedWithin !== 'any' ? 1 : 0) +
    (roleFilter !== 'all' ? 1 : 0)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const now = Date.now()
    const cutoffMs: Record<string, number> = { '7d': 7, '30d': 30, '60d': 60 }
    let out = leads
    if (sourceFilter != null) out = out.filter((l) => l.sourceId === sourceFilter)
    if (companyFilter) out = out.filter((l) => l.company === companyFilter)
    if (normLocFilter) out = out.filter((l) => l.locationNorm === normLocFilter)
    if (remoteScopes.size > 0) out = out.filter((l) => remoteScopes.has(l.remoteScope))
    if (roleFilter === 'marketing') out = out.filter((l) => isMarketingRole(l.title))
    else if (roleFilter === 'other') out = out.filter((l) => !isMarketingRole(l.title))
    if (minSalary > 0) out = out.filter((l) => {
      if (l.salaryMin == null && l.salaryMax == null) return false
      const periodMul = l.salaryPeriod === 'month' ? 12 : 1
      const ccyMul = CCY_TO_INR[l.salaryCcy] ?? 1
      const top = Math.max(l.salaryMin ?? 0, l.salaryMax ?? 0) * periodMul * ccyMul
      return top >= minSalary
    })
    if (postedWithin !== 'any') {
      const days = cutoffMs[postedWithin] ?? 30
      const cutoff = now - days * 24 * 60 * 60 * 1_000
      out = out.filter((l) => l.postedAt && new Date(l.postedAt).getTime() >= cutoff)
    }
    if (needle) out = out.filter((l) => (
      l.title.toLowerCase().includes(needle) ||
      l.company.toLowerCase().includes(needle) ||
      l.location.toLowerCase().includes(needle) ||
      l.salary.toLowerCase().includes(needle) ||
      decodeEntities(l.description).toLowerCase().includes(needle)
    ))
    const sorted = [...out]
    // Default: newest first (by seenAt — when we first saw the lead in the DB).
    if (sort === 'newest') sorted.sort((a, b) => +new Date(b.seenAt) - +new Date(a.seenAt))
    else if (sort === 'oldest') sorted.sort((a, b) => +new Date(a.seenAt) - +new Date(b.seenAt))
    else if (sort === 'company') sorted.sort((a, b) => a.company.localeCompare(b.company))
    else if (sort === 'salary') {
      sorted.sort((a, b) => {
        const aVal = Math.max(a.salaryMin ?? -1, a.salaryMax ?? -1)
        const bVal = Math.max(b.salaryMin ?? -1, b.salaryMax ?? -1)
        return bVal - aVal
      })
    }
    return sorted
  }, [leads, q, sourceFilter, companyFilter, normLocFilter, sort, remoteScopes, minSalary, postedWithin, roleFilter])

  useEffect(() => { setPage(1) }, [q, sourceFilter, companyFilter, normLocFilter, sort, remoteScopes, minSalary, postedWithin, roleFilter])

  // Per-crossKey occurrence count → drives the "Seen on N boards" chip.
  // Only counts when crossKey is non-empty (titleless / companyless rows
  // can't be cross-deduped). Computed against the FULL leads array (not
  // the filtered slice) so the count is honest across hidden rows.
  const crossKeyCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      if (!l.crossKey) continue
      m.set(l.crossKey, (m.get(l.crossKey) ?? 0) + 1)
    }
    return m
  }, [leads])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
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

  function deleteLead(id: number) {
    start(async () => {
      const r = await deleteJobLeadAction(id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Lead deleted')
      setConfirmDeleteLeadId(null)
      router.refresh()
    })
  }

  function deleteBulk() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    start(async () => {
      const r = await bulkDeleteJobLeadsAction(ids)
      if ('error' in r && r.error) { toast.error(r.error); return }
      const n = 'deleted' in r ? r.deleted : ids.length
      toast.success(`Deleted ${n} lead${n === 1 ? '' : 's'}`)
      setSelected(new Set())
      setConfirmDeleteBulk(false)
      setPage(1)
      router.refresh()
    })
  }

  function convertToDraft(id: number) {
    start(async () => {
      const r = await leadToDraftAction(id)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Draft created — go to Drafts to add recruiter email and send.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Role-category tabs: Marketing / All / Others ── */}
      <div className="flex items-center gap-1 border-b pb-2">
        {([
          ['all',       'All roles',                leads.length],
          ['marketing', '📣 Marketing / DM',        leads.filter(l => isMarketingRole(l.title)).length],
          ['other',     'Others',                   leads.filter(l => !isMarketingRole(l.title)).length],
        ] as const).map(([key, lbl, cnt]) => (
          <button key={key} type="button"
            onClick={() => setRoleFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ea-transition border ${roleFilter === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted border-transparent'}`}>
            {lbl} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${roleFilter === key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{cnt}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length !== leads.length ? <><strong>{filtered.length}</strong> of {leads.length}</> : <><strong>{leads.length}</strong> {leads.length === 1 ? 'lead' : 'leads'}</>}
        </span>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/jobs/export?status=${status}`} download>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </a>
        </Button>
      </div>

      {/* ── Row 1: primary filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, company, location, JD…" className="pl-8 h-9 text-sm" />
        </div>
        {sources.length > 1 ? (
          <select value={sourceFilter ?? ''} onChange={(e) => setSourceFilter(e.target.value === '' ? null : Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="Filter by source">
            <option value="">All sources</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        ) : null}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="Sort by">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="company">Company A–Z</option>
          <option value="salary">Salary ↓</option>
        </select>
        {/* Filters toggle — shows badge with count of active secondary filters */}
        <button type="button"
          onClick={() => setShowFilters(f => !f)}
          className={`relative h-9 rounded-md border px-3 text-xs font-medium ea-transition ${showFilters || activeFilterCount > 0 ? 'border-primary bg-primary/5 text-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" onClick={() => {
            setCompanyFilter(''); setNormLocFilter(''); setRemoteScopes(new Set())
            setMinSalary(0); setPostedWithin('any'); setRoleFilter('all')
          }} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ea-transition">
            Clear all
          </button>
        )}
      </div>

      {/* ── Row 2: secondary filters (collapsible) ── */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2.5">

          {/* Company filter */}
          {companies.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Company</span>
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs" aria-label="Filter by company">
                <option value="">Any</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ) : null}

          {/* Location filter — uses locationNorm (deduplicated normalized cities) */}
          {normLocations.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">City</span>
              <select value={normLocFilter} onChange={(e) => setNormLocFilter(e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs" aria-label="Filter by city">
                <option value="">Any</option>
                {normLocations.map((loc) => (
                  <option key={loc} value={loc}>{loc.charAt(0).toUpperCase() + loc.slice(1)}</option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Remote scope chips */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-muted-foreground mr-0.5">Work mode</span>
            {([
              ['office',        'Office'],
              ['hybrid',        'Hybrid'],
              ['remote-in',     'Remote IN'],
              ['remote-global', 'Remote'],
            ] as const).map(([k, label]) => {
              const on = remoteScopes.has(k)
              return (
                <button key={k} type="button"
                  onClick={() => {
                    const next = new Set(remoteScopes)
                    if (next.has(k)) next.delete(k); else next.add(k)
                    setRemoteScopes(next)
                  }}
                  className={`h-6 rounded-full border px-2 text-[10px] font-medium ea-transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  aria-pressed={on}>
                  {label}
                </button>
              )
            })}
          </div>

          {/* Salary preset buttons */}
          <div className="flex items-center gap-1">
            <IndianRupee className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground mr-0.5">Min salary</span>
            {SALARY_PRESETS.map(({ label, value }) => (
              <button key={label} type="button"
                onClick={() => setMinSalary(value)}
                className={`h-6 rounded-full border px-2 text-[10px] font-medium ea-transition ${minSalary === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Posted-within filter */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">Posted</span>
            <select value={postedWithin} onChange={(e) => setPostedWithin(e.target.value as typeof postedWithin)}
              className="h-7 rounded-md border bg-background px-2 text-xs" aria-label="Posted within">
              <option value="any">Any time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="60d">Last 60 days</option>
            </select>
          </div>

        </div>
      )}

      {/* Bulk action bar */}
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
          <Button size="sm" variant="ghost" disabled={busy || pending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Permanently delete selected leads"
            onClick={() => setConfirmDeleteBulk(true)}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete all
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      ) : null}

      {/* Bulk-delete confirmation banner — no browser confirm(). */}
      {confirmDeleteBulk ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <span className="font-medium text-destructive">
            Permanently delete {selected.size} selected lead{selected.size === 1 ? '' : 's'}? This cannot be undone.
          </span>
          <span className="text-[11px] text-muted-foreground">Drafts and contacts created from these leads are not affected.</span>
          <Button size="sm" variant="destructive" disabled={busy || pending} onClick={deleteBulk}>Yes, delete all</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteBulk(false)}>Cancel</Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">
          {leads.length === 0
            ? 'No leads here yet. Refresh a source to pull listings.'
            : (q || sourceFilter != null || companyFilter || normLocFilter || activeFilterCount > 0)
              ? 'No leads match the current filters.'
              : 'No leads found.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          {/* Select-all header row */}
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2">
            <input type="checkbox" aria-label="Select all visible" checked={allSelected}
              onChange={(e) => {
                const n = new Set(selected)
                if (e.target.checked) for (const l of filtered) n.add(l.id)
                else for (const l of filtered) n.delete(l.id)
                setSelected(n)
              }}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] text-muted-foreground">Select all visible ({filtered.length})</span>
          </div>

          {/* Lead rows */}
          <ul className="divide-y">
            {visible.map((l) => {
              const src = sourceById.get(l.sourceId)
              if (confirmDeleteLeadId === l.id) {
                return (
                  <li key={l.id} className="flex items-center gap-3 bg-destructive/5 px-4 py-3 border-l-4 border-destructive">
                    <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-sm font-medium text-destructive">Delete this lead?</span>
                    <span className="truncate text-xs text-muted-foreground">{l.title}{l.company ? ` — ${l.company}` : ''}</span>
                    <Button size="sm" variant="destructive" disabled={busy || pending}
                      onClick={() => deleteLead(l.id)} className="ml-auto">Yes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteLeadId(null)}>No</Button>
                  </li>
                )
              }
              return (
                <li key={l.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/20 ea-transition">
                  <input type="checkbox" aria-label={`Select ${l.title}`}
                    checked={selected.has(l.id)}
                    onChange={(e) => {
                      const n = new Set(selected); if (e.target.checked) n.add(l.id); else n.delete(l.id); setSelected(n)
                    }}
                    className="mt-1 h-3.5 w-3.5 shrink-0"
                  />

                  {/* Main content — click anywhere to open detail */}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setDetailLead(l)}
                  >
                    {/* Title + cross-board duplicate badge */}
                    <div className="font-semibold text-sm leading-snug group-hover:text-primary ea-transition">
                      {l.title}
                      {l.description ? null : (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground italic">no JD</span>
                      )}
                      {l.crossKey && (crossKeyCounts.get(l.crossKey) ?? 0) > 1 ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-400"
                              title={`This role appears on ${crossKeyCounts.get(l.crossKey)} sources — canonical row shown.`}>
                          ↻ {crossKeyCounts.get(l.crossKey)} sources
                        </span>
                      ) : null}
                      {l.remoteScope && l.remoteScope !== 'office' ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400"
                              title="Remote scope (from normalized location)">
                          {l.remoteScope === 'hybrid' ? 'Hybrid' :
                           l.remoteScope === 'remote-in' ? 'Remote IN' :
                           l.remoteScope === 'remote-global' ? 'Remote' : l.remoteScope}
                        </span>
                      ) : null}
                    </div>
                    {/* Meta chips */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {l.company ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                          <Building2 className="h-3 w-3 shrink-0" /> {l.company}
                        </span>
                      ) : null}
                      {l.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" /> {l.location}
                        </span>
                      ) : null}
                      {l.salary ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <IndianRupee className="h-3 w-3 shrink-0" /> {l.salary}
                        </span>
                      ) : null}
                      {l.postedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          {new Date(l.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      ) : null}
                      {src ? (
                        <span className="inline-flex items-center gap-1 opacity-50">
                          <Tag className="h-3 w-3 shrink-0" /> {src.label}
                        </span>
                      ) : null}
                    </div>
                    {/* Description snippet */}
                    {l.description ? (
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 max-w-2xl">{decodeEntities(l.description)}</p>
                    ) : null}
                  </button>

                  {/* Row actions — right side */}
                  <div className="ea-row-actions flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" title="View full details"
                      onClick={() => setDetailLead(l)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                    <Button size="sm" variant="default" disabled={busy || pending}
                      title="Create outreach draft" onClick={() => convertToDraft(l.id)}>
                      <MailPlus className="h-3.5 w-3.5 mr-1" /> Draft
                    </Button>
                    {showSaveButton ? (
                      <Button size="sm" variant="outline" disabled={busy || pending}
                        title="Save for later" onClick={() => setStatus(l.id, 'saved')}>
                        <Bookmark className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {isArchived ? (
                      <>
                        <Button size="sm" variant="outline" disabled={busy || pending}
                          title="Restore to Saved tab"
                          onClick={() => setStatus(l.id, 'saved')}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy || pending}
                          onClick={() => setStatus(l.id, 'applied')}>Applied</Button>
                        <Button size="sm" variant="ghost" disabled={busy || pending}
                          onClick={() => setStatus(l.id, 'ignored')}>Ignore</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy || pending}
                      title="Delete lead permanently"
                      aria-label="Delete lead"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmDeleteLeadId(l.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {l.link ? (
                      <a href={l.link} target="_blank" rel="noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ea-transition"
                        title="Open original listing">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="px-1 text-[10px] text-muted-foreground/60 select-none">(no link)</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {pageCount} ({filtered.length} leads)</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      ) : null}

      {/* Full-detail dialog — opens when a lead row is clicked */}
      {detailLead ? (
        <JobDetailDialog
          lead={detailLead}
          src={sourceById.get(detailLead.sourceId)}
          open={Boolean(detailLead)}
          onClose={() => setDetailLead(null)}
          onDraft={convertToDraft}
          onStatus={setStatus}
          busy={busy || pending}
        />
      ) : null}
    </div>
  )
}
