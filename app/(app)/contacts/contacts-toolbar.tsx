'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, RotateCcw, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importContactsAction, resetStatusAction } from '@/server/actions/contacts'

interface ImportReport {
  imported: number; duplicates: number; rejected: number; total: number
  errors: Array<{ line: number; reason: string; sample?: string }>
}

export function ContactsToolbar() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  // Detailed report from the last import. Shown as a collapsible card so
  // the user can see exactly which rows the parser rejected and why.
  const [report, setReport] = useState<ImportReport | null>(null)

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
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
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
    </div>
  )
}
