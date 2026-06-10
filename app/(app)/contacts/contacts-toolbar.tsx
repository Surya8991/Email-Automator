'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Upload, RotateCcw, FileText, X, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import {
  importContactsAction, resetStatusAction,
  dedupeContactsAction, deleteAllContactsAction, deleteFilteredContactsAction,
} from '@/server/actions/contacts'
import { useProgress } from '@/components/use-progress'

interface ImportReport {
  imported: number; duplicates: number; rejected: number; total: number
  errors: Array<{ line: number; reason: string; sample?: string }>
}

export function ContactsToolbar() {
  const router = useRouter()
  const sp = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  // Detailed report from the last import. Shown as a collapsible card so
  // the user can see exactly which rows the parser rejected and why.
  const [report, setReport] = useState<ImportReport | null>(null)
  // Confirmation dialog for the nuclear "Delete all" action. Requires the
  // user to type the exact phrase — same gate as before, just accessible.
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [confirmPhrase, setConfirmPhrase] = useState('')

  // SSE-streamed import progress — surface as a bar under the toolbar
  // once an import is in flight.
  const progress = useProgress()
  const isImportEvent = progress?.type?.startsWith('contact_import_')
  const importPct = (isImportEvent && progress && progress.total && progress.total > 0)
    ? Math.min(100, Math.round(((progress.processed ?? 0) / progress.total) * 100))
    : 0
  const showImportBar = pending || (isImportEvent && progress?.type !== 'contact_import_done')

  // Snapshot the current filter set so "Delete matching" targets exactly
  // what the user sees, not the whole table.
  const filters = {
    search: sp.get('search') ?? '',
    tag: sp.get('tag') ?? '',
    status: sp.get('status') ?? '',
    company: sp.get('company') ?? '',
    location: sp.get('location') ?? '',
    platform: sp.get('platform') ?? '',
  }
  const hasFilter = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const fd = new FormData()
          fd.set('file', f)
          start(async () => {
            setReport(null)
            const r = await importContactsAction(fd)
            if ('error' in r && r.error) { setMsg(r.error); return }
            if ('ok' in r && r.ok) {
              const parts = [`${r.imported} imported`]
              if (r.duplicates) parts.push(`${r.duplicates} duplicates`)
              if (r.rejected) parts.push(`${r.rejected} rejected`)
              setMsg(parts.join(' · '))
              setReport({
                imported: r.imported, duplicates: r.duplicates,
                rejected: r.rejected, total: r.total, errors: r.errors,
              })
            }
            router.refresh()
          })
          // Reset so re-selecting the same file fires onChange again
          if (fileRef.current) fileRef.current.value = ''
        }}
      />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
        <Upload className="mr-1.5 h-4 w-4" /> Import
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href="/api/contacts/export" download><Download className="mr-1.5 h-4 w-4" /> Export</a>
      </Button>
      <Button variant="ghost" size="sm" asChild title="Download a starter CSV with the right column headers + 5 realistic sample rows">
        <a href="/api/csv-template" download><FileText className="mr-1.5 h-4 w-4" /> Sample CSV</a>
      </Button>
      <Button variant="ghost" size="sm" disabled={pending}
        onClick={() => {
          if (!confirm('Reset email status on every contact?')) return
          start(async () => { await resetStatusAction(); router.refresh(); setMsg('Status reset') })
        }}>
        <RotateCcw className="mr-1.5 h-4 w-4" /> Reset status
      </Button>
      <Button variant="ghost" size="sm" disabled={pending}
        title="Find rows with duplicate emails and keep only the oldest one per email"
        onClick={() => {
          if (!confirm('Scan all contacts and remove duplicate-email rows? The oldest occurrence per email is kept.')) return
          start(async () => {
            const r = await dedupeContactsAction()
            router.refresh()
            if ('removed' in r) {
              const summary = r.removed === 0
                ? 'No duplicates found.'
                : `Removed ${r.removed} duplicate row${r.removed === 1 ? '' : 's'} across ${r.affectedEmails} email${r.affectedEmails === 1 ? '' : 's'}.`
              toast.success(summary)
              setMsg(summary)
            }
          })
        }}>
        <Copy className="mr-1.5 h-4 w-4" /> Dedupe
      </Button>
      {hasFilter ? (
        <Button variant="ghost" size="sm" disabled={pending}
          title="Delete every contact matching the current filter set"
          onClick={() => {
            const summary = Object.entries(filters).filter(([, v]) => v)
              .map(([k, v]) => `${k}=${v}`).join(' · ')
            if (!confirm(`Delete EVERY contact matching:\n  ${summary}\n\nThis cannot be undone. Continue?`)) return
            start(async () => {
              const r = await deleteFilteredContactsAction(filters)
              router.refresh()
              if ('deleted' in r) {
                toast.success(`Deleted ${r.deleted} contact${r.deleted === 1 ? '' : 's'} matching the filter.`)
                setMsg(`Deleted ${r.deleted} matching contacts.`)
              }
            })
          }}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete matching
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={pending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Delete every contact in your account"
        onClick={() => { setConfirmPhrase(''); setConfirmDeleteAll(true) }}>
        <Trash2 className="mr-1.5 h-4 w-4" /> Delete all
      </Button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
      {showImportBar ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${importPct}%` }}
              role="progressbar"
              aria-valuenow={importPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Import progress"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {isImportEvent && progress?.total
              ? `Importing ${progress.processed ?? 0} / ${progress.total} rows · ${importPct}%`
              : 'Parsing file…'}
          </p>
        </div>
      ) : null}
      {report && report.errors.length > 0 ? (
        <details className="rounded-md border bg-muted/30 p-2 text-xs" open>
          <summary className="cursor-pointer font-medium">
            Import report — {report.errors.length} issue{report.errors.length === 1 ? '' : 's'} (showing first 200)
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setReport(null); setMsg(null) }}
              className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent"
              aria-label="Dismiss report"
            >
              <X className="h-3 w-3" />
            </button>
          </summary>
          <ul className="mt-2 max-h-64 overflow-auto space-y-0.5">
            {report.errors.map((e, i) => (
              <li key={i} className="text-muted-foreground">
                {e.line ? <span className="font-mono">L{e.line}:</span> : null} {e.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog open={confirmDeleteAll} onOpenChange={(o) => { if (!o) { setConfirmDeleteAll(false); setConfirmPhrase('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete every contact?</DialogTitle>
            <DialogDescription>
              This permanently removes every contact in your account, along with their email history. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label htmlFor="delete-phrase" className="text-sm">Type <span className="font-mono font-semibold">DELETE ALL</span> to confirm:</label>
            <Input id="delete-phrase" value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setConfirmDeleteAll(false); setConfirmPhrase('') }}>Cancel</Button>
            <Button variant="destructive" disabled={pending || confirmPhrase !== 'DELETE ALL'} onClick={() => {
              setConfirmDeleteAll(false)
              const phrase = confirmPhrase
              setConfirmPhrase('')
              if (phrase !== 'DELETE ALL') { setMsg('Cancelled — phrase did not match.'); return }
              start(async () => {
                const r = await deleteAllContactsAction()
                router.refresh()
                if ('deleted' in r) {
                  toast.success(`Deleted ${r.deleted} contact${r.deleted === 1 ? '' : 's'}.`)
                  setMsg(`Deleted ${r.deleted} contacts.`)
                }
              })
            }}>Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
