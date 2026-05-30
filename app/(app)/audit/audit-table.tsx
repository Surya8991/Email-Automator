'use client'
// Client wrapper around the 500-row audit table so we can search +
// filter without round-tripping. Pure presentational — server fetches +
// formats, this just hides rows.
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Row {
  id: number; action: string; createdAt: string; detail: string; ip: string
  // Raw timestamp passed through for date-range filtering. The displayed
  // string (createdAt) is pre-formatted in the user's TZ on the server.
  ts: number
}

export function AuditTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  // Date range — both bounds optional, both inclusive at day granularity.
  // Stored as YYYY-MM-DD strings (the <input type="date"> contract).
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Distinct action types in the current window, for the filter dropdown.
  // Stable list as long as the server-rendered rows are stable.
  const actions = useMemo(() =>
    Array.from(new Set(rows.map((r) => r.action))).filter(Boolean).sort(),
    [rows])

  const filtered = useMemo(() => {
    // Parse the date bounds once per render. fromMs is start-of-day; toMs
    // is end-of-day so the to-date is inclusive (a 2026-05-31 entry shows
    // when to=2026-05-31).
    const fromMs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0
    const toMs = toDate ? new Date(toDate + 'T23:59:59.999').getTime() : Infinity
    return rows.filter((r) => {
      if (action && r.action !== action) return false
      if (r.ts < fromMs || r.ts > toMs) return false
      if (q.trim()) {
        const n = q.toLowerCase()
        if (![r.action, r.detail, r.ip, r.createdAt].some((v) => v.toLowerCase().includes(n))) return false
      }
      return true
    })
  }, [rows, action, q, fromDate, toDate])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search action, detail, IP, time…" className="pl-8" />
        </div>
        {actions.length > 0 ? (
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : null}
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="h-9 w-auto" title="From date" />
        <span className="text-xs text-muted-foreground">→</span>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="h-9 w-auto" title="To date" />
        {fromDate || toDate ? (
          <button type="button" onClick={() => { setFromDate(''); setToDate('') }}
            className="text-xs text-muted-foreground underline hover:text-foreground">
            clear dates
          </button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length === rows.length ? `${rows.length} entries` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No entries match the filter.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{r.createdAt}</td>
                <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{r.detail || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
