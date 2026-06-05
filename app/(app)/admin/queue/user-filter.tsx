'use client'
import { useRouter, useSearchParams } from 'next/navigation'

interface User { id: string; email: string }

export function UserFilter({ users, selectedId }: { users: User[]; selectedId: string }) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <select
      value={selectedId}
      onChange={(e) => {
        const next = new URLSearchParams(params)
        if (e.target.value) next.set('user', e.target.value)
        else next.delete('user')
        router.push(`/admin/queue${next.toString() ? `?${next}` : ''}`)
      }}
      className="h-8 max-w-xs rounded-md border bg-background px-2 text-xs"
    >
      <option value="">All users</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.email}</option>
      ))}
    </select>
  )
}
