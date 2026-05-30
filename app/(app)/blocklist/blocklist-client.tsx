'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addBlocklistAction, removeBlocklistAction, bulkAddBlocklistAction } from '@/server/actions/blocklist'
import { useFormatDate } from '@/components/timezone-provider'

interface Row { id: number; userId: string | null; pattern: string; type: string; createdAt: Date }

export function BlocklistClient({ rows }: { rows: Row[] }) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pattern, setPattern] = useState('')
  const [type, setType] = useState<'email' | 'domain'>('email')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'domain'>('all')
  const filtered = rows.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (q.trim() && !r.pattern.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="email@example.com or example.com" className="max-w-sm" />
        <select value={type} onChange={(e) => setType(e.target.value as 'email' | 'domain')}
          className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="email">Email</option>
          <option value="domain">Domain</option>
        </select>
        <Button disabled={pending || !pattern} onClick={() => start(async () => {
          setErr(null)
          const r = await addBlocklistAction({ pattern, type })
          if ('error' in r && r.error) { setErr(r.error); return }
          setPattern(''); router.refresh()
        })}>Block</Button>
        <Button variant="outline" disabled={pending} onClick={() => setBulkOpen((x) => !x)}>
          <Upload className="mr-1.5 h-4 w-4" /> Bulk add
        </Button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </div>
      {bulkOpen ? (
        <div className="border-b bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Paste emails or domains, one per line (or comma-separated).
            Anything with <code>@</code> is treated as an email; everything
            else as a domain.
          </p>
          <textarea
            value={bulkText} onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={'spam@example.com\nbadcompany.com\nclickbait.io'}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !bulkText.trim()} onClick={() => start(async () => {
              const r = await bulkAddBlocklistAction(bulkText)
              toast.success(`Added ${r.added}${r.skipped ? ` · ${r.skipped} skipped` : ''}`)
              setBulkText(''); setBulkOpen(false); router.refresh()
            })}>Add list</Button>
            <Button size="sm" variant="ghost" onClick={() => { setBulkOpen(false); setBulkText('') }}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search pattern…" className="h-8 pl-8" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="all">All types</option>
            <option value="email">Email</option>
            <option value="domain">Domain</option>
          </select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length === rows.length ? `${rows.length}` : `${filtered.length}/${rows.length}`}
          </span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">No blocked patterns yet.</div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground">No patterns match.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pattern</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.pattern}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.userId === null ? 'global' : 'you'}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  {r.userId !== null ? (
                    <Button variant="ghost" size="icon" aria-label="Remove" disabled={pending}
                      onClick={() => start(async () => { await removeBlocklistAction(r.id); router.refresh() })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
