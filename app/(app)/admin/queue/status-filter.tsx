'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export function StatusFilter({ selected }: { selected: string }) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <select
      value={selected}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        if (e.target.value) next.set('status', e.target.value)
        else next.delete('status')
        next.delete('page') // reset to page 1 on filter change
        router.push(`/admin/queue${next.toString() ? `?${next}` : ''}`)
      }}
      className="h-8 rounded-md border bg-background px-2 text-xs"
    >
      <option value="">All statuses</option>
      <option value="Scheduled">Scheduled</option>
      <option value="Retrying">Retrying</option>
      <option value="Sending">Sending</option>
    </select>
  )
}
