'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, RotateCcw, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importContactsAction, resetStatusAction } from '@/server/actions/contacts'

export function ContactsToolbar() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
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
            const r = await importContactsAction(fd)
            if ('error' in r && r.error) { setMsg(r.error); return }
            if ('ok' in r && r.ok) setMsg(`Imported ${r.imported} of ${r.total} (${r.duplicates} duplicates)`)
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
      <Button variant="ghost" size="sm" asChild>
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
  )
}
