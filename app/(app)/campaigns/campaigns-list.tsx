'use client'
// Client wrapper that adds search + status filter to the campaign grid.
// Pure presentational over the server-fetched list. Keeps the page.tsx
// a thin server component.
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface Item { id: number; name: string; status: string; stepCount: number; enrolled: number }

const STATUS_CLASS: Record<string, string> = {
  active:   'bg-emerald-500/15 text-emerald-600',
  paused:   'bg-amber-500/15 text-amber-600',
  archived: 'bg-muted text-muted-foreground',
  draft:    'bg-muted text-foreground',
}

export function CampaignsList({ list }: { list: Item[] }) {
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState<string>('all')

  const filtered = useMemo(() => list.filter((c) => {
    if (statusF !== 'all' && c.status !== statusF) return false
    if (q.trim() && !c.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [list, q, statusF])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…" className="pl-8" />
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length === list.length ? `${list.length} campaigns` : `${filtered.length}/${list.length}`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No campaigns match the filter.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">{c.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLASS[c.status] ?? 'bg-muted'}`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div><span className="font-medium text-foreground">{c.stepCount}</span> steps</div>
                    <div><span className="font-medium text-foreground">{c.enrolled}</span> enrolled</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
