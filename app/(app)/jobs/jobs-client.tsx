'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, RefreshCw, Trash2, ExternalLink, Bookmark, Briefcase, CheckCircle2, XCircle, Building2,
  Search, Download, MailPlus,
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
  leadToDraftAction,
} from '@/server/actions/job-tracker'
import { JobPresetPicker } from './preset-picker'

interface SourceRow {
  id: number; label: string; url: string; keywords: string; active: boolean
  lastFetchedAt: number | null; lastStatus: string; lastError: string
}
interface LeadRow {
  id: number; title: string; company: string; link: string; location: string
  status: string; sourceId: number; seenAt: Date
}

export function JobsClient({
  sources, leadsNew, leadsSaved,
}: {
  sources: SourceRow[]; leadsNew: LeadRow[]; leadsSaved: LeadRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'new' | 'saved' | 'sources'>(sources.length === 0 ? 'sources' : 'new')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<'new' | 'saved' | 'sources'>
          value={tab} onChange={setTab}
          ariaLabel="Jobs view"
          options={[
            { value: 'new',     label: `New (${leadsNew.length})`,    icon: Briefcase },
            { value: 'saved',   label: `Saved (${leadsSaved.length})`, icon: Bookmark },
            { value: 'sources', label: `Sources (${sources.length})`,   icon: Building2 },
          ]}
        />
        <div className="flex items-center gap-2">
          <JobPresetPicker />
          <AddSourceDialog />
        </div>
      </div>

      {tab === 'sources' ? (
        <SourcesTable sources={sources} pending={pending} router={router} start={start} />
      ) : (
        <LeadsTable
          leads={tab === 'new' ? leadsNew : leadsSaved}
          pending={pending}
          showSaveButton={tab === 'new'}
          status={tab}
        />
      )}
    </div>
  )
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
  if (sources.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        No sources yet. Click <strong>Add source</strong> above.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="ea-table">
        <thead><tr>
          <th>Label</th>
          <th>Keywords</th>
          <th>Last status</th>
          <th className="w-32 text-right">Actions</th>
        </tr></thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id}>
              <td>
                <div className="font-medium">{s.label}</div>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <span className="truncate max-w-[24rem]">{s.url}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </td>
              <td className="text-xs text-muted-foreground">{s.keywords || <em>(any)</em>}</td>
              <td className="text-xs">
                {s.lastStatus ? (
                  <span className={`inline-flex items-center gap-1 ${s.lastStatus.startsWith('ok') ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {s.lastStatus.startsWith('ok') ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {s.lastStatus}
                  </span>
                ) : <span className="text-muted-foreground italic">never run</span>}
                {s.lastError ? <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{s.lastError}</div> : null}
              </td>
              <td>
                <div className="ea-row-actions flex justify-end gap-1">
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
  )
}

function LeadsTable({
  leads, pending, showSaveButton, status,
}: {
  leads: LeadRow[]; pending: boolean; showSaveButton: boolean; status: 'new' | 'saved'
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [q, setQ] = useState('')
  // Client-side filter — cheap because we already cap server-side at
  // 200. Matches title + company + location with a substring search.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return leads
    return leads.filter((l) => (
      l.title.toLowerCase().includes(needle) ||
      l.company.toLowerCase().includes(needle) ||
      l.location.toLowerCase().includes(needle)
    ))
  }, [leads, q])

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
        <div className="text-xs text-muted-foreground">{filtered.length} of {leads.length} {leads.length === 1 ? 'lead' : 'leads'}</div>
        <Button variant="outline" size="sm" asChild className="ml-auto">
          <a href={`/api/jobs/export?status=${status}`} download>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </a>
        </Button>
      </div>

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
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Seen</th>
              <th className="w-64 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.link ? (
                      <a href={l.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                        {l.title} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="font-medium">{l.title}</span>}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
