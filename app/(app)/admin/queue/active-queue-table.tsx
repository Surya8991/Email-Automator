'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bulkCancelQueueAction } from '@/server/actions/admin'
import { ServerFormat } from '../server-format'

interface Row {
  id: number
  userEmail: string
  recipient: string
  subject: string
  status: string
  scheduledAt: string
}

export function ActiveQueueTable({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Only Scheduled/Retrying rows can be cancelled; Sending is mid-flight.
  const isSelectable = (r: Row) => r.status === 'Scheduled' || r.status === 'Retrying'
  const selectableRows = rows.filter(isSelectable)
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id))
  const someSelected = selectableRows.some((r) => selected.has(r.id)) && !allSelected

  function toggleAll() {
    const next = new Set(selected)
    if (allSelected) selectableRows.forEach((r) => next.delete(r.id))
    else selectableRows.forEach((r) => next.add(r.id))
    setSelected(next)
  }
  function toggleOne(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  function bulkCancel() {
    if (selected.size === 0) return
    if (!confirm(`Cancel ${selected.size} queued send${selected.size === 1 ? '' : 's'}? Sending rows are not affected.`)) return
    const ids = Array.from(selected)
    start(async () => {
      const r = await bulkCancelQueueAction(ids)
      if ('error' in r) { toast.error(r.error ?? 'Failed'); return }
      toast.success(`Cancelled ${r.cancelled ?? 0} of ${r.requested ?? ids.length} row(s).`)
      setSelected(new Set())
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Nothing scheduled right now.</p>
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={bulkCancel}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2">
              <input type="checkbox" aria-label="Select all"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected }}
                onChange={toggleAll}
                disabled={selectableRows.length === 0} />
            </th>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Recipient</th>
            <th className="px-3 py-2">Subject</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">
                <input type="checkbox" aria-label={`Select ${r.recipient}`}
                  checked={selected.has(r.id)}
                  onChange={() => toggleOne(r.id)}
                  disabled={!isSelectable(r)} />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground"><ServerFormat at={r.scheduledAt} /></td>
              <td className="px-3 py-2 font-mono text-xs">{r.userEmail}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.recipient}</td>
              <td className="px-3 py-2 truncate" title={r.subject}>{r.subject}</td>
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Sending' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    : status === 'Retrying' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
    : 'bg-muted text-foreground'
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{status}</span>
}
