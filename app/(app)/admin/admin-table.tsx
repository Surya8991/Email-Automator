'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Shield, User, Pause, Play, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteUserAction, suspendUserAction } from '@/server/actions/admin'
import { useFormatDate } from '@/components/timezone-provider'

interface Row {
  id: string; email: string; name: string; createdAt: string
  isAdmin: boolean; isMe: boolean; suspended: boolean
  contacts: number; drafts: number; events: number
}

export function AdminTable({ rows }: { rows: Row[] }) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'admin'>('all')
  const visible = rows.filter((r) => {
    if (filter === 'suspended' && !r.suspended) return false
    if (filter === 'active' && r.suspended) return false
    if (filter === 'admin' && !r.isAdmin) return false
    if (q.trim() && !r.email.toLowerCase().includes(q.toLowerCase()) && !r.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <>
      {err ? <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name…" className="h-8 pl-8" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="all">All users</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="admin">Admins</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length === rows.length ? `${rows.length} users` : `${visible.length}/${rows.length}`}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Contacts</th>
            <th className="px-3 py-2">Drafts</th>
            <th className="px-3 py-2">Events</th>
            <th className="px-3 py-2">Joined</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No users match.</td></tr>
          ) : null}
          {visible.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5">
                  {r.isAdmin ? <Shield className="h-3 w-3 text-amber-500" /> : <User className="h-3 w-3 text-muted-foreground" />}
                  {r.email}
                  {r.isMe ? <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">you</span> : null}
                </span>
              </td>
              <td className="px-3 py-2">{r.name || '—'}</td>
              <td className="px-3 py-2">{r.contacts}</td>
              <td className="px-3 py-2">{r.drafts}</td>
              <td className="px-3 py-2">{r.events}</td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2 text-right">
                {r.isMe || r.isAdmin ? (
                  <span className="text-xs text-muted-foreground">read-only</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {r.suspended ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">suspended</span> : null}
                    <Button
                      variant="ghost" size="icon"
                      aria-label={r.suspended ? 'Resume sends' : 'Suspend sends'}
                      title={r.suspended ? 'Resume — worker will send for them again' : 'Suspend — worker stops sending for them'}
                      disabled={pending}
                      onClick={() => start(async () => {
                        setErr(null)
                        const res = await suspendUserAction(r.id, !r.suspended)
                        if ('error' in res && res.error) setErr(res.error)
                        router.refresh()
                      })}>
                      {r.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete user" disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete ${r.email}? Their contacts/templates/drafts/sessions/events all go too.`)) return
                        start(async () => {
                          setErr(null)
                          const res = await deleteUserAction(r.id)
                          if ('error' in res && res.error) setErr(res.error)
                          router.refresh()
                        })
                      }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
