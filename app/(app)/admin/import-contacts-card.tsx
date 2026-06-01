'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Check, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { adminImportContactsAction } from '@/server/actions/admin'

interface Result {
  imported: number; duplicates: number; rejected: number; total: number
  errors: Array<{ line: number; reason: string }>
}

export function AdminImportContactsCard() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk import contacts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload a Universal Job Tracker workbook (.xlsx) or any CSV/Excel with a Contacts sheet.
          Rows land in your admin account, tagged <code>crm-import,job-tracker</code>. Idempotent —
          re-uploading skips emails already in your contacts.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setFileName(f.name)
            const fd = new FormData()
            fd.set('file', f)
            start(async () => {
              setErr(null); setResult(null)
              const r = await adminImportContactsAction(fd)
              if ('error' in r && r.error) { setErr(r.error); return }
              if ('ok' in r && r.ok) {
                setResult({
                  imported: r.imported, duplicates: r.duplicates,
                  rejected: r.rejected, total: r.total, errors: r.errors,
                })
                router.refresh()
              }
            })
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            {pending ? 'Importing…' : 'Choose file'}
          </Button>
          {fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
        </div>
        {err ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{err}</span>
          </div>
        ) : null}
        {result ? (
          <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4 text-emerald-500" />
              {result.imported} imported · {result.duplicates} dupes · {result.rejected} rejected
            </div>
            {result.errors.length > 0 ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">First {result.errors.length} rejection{result.errors.length === 1 ? '' : 's'}</summary>
                <ul className="mt-1 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.line ? <span className="font-mono">L{e.line}:</span> : null} {e.reason}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
