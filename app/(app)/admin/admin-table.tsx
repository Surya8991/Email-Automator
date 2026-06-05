'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Shield, User, Pause, Play, Search, Download, Eye, UserCog, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  deleteUserAction, suspendUserAction, bulkSuspendUsersAction,
  setUserQuotaAction, impersonateUserAction,
} from '@/server/actions/admin'
import { useFormatDate } from '@/components/timezone-provider'
import { UserDetailDrawer } from './user-detail-drawer'

interface Row {
  id: string; email: string; name: string; createdAt: string
  isAdmin: boolean; isMe: boolean; suspended: boolean
  contacts: number; drafts: number; events: number
  quotaOverride: number
}

export function AdminTable({ rows }: { rows: Row[] }) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'admin'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null)
  const visible = useMemo(() => rows.filter((r) => {
    if (filter === 'suspended' && !r.suspended) return false
    if (filter === 'active' && r.suspended) return false
    if (filter === 'admin' && !r.isAdmin) return false
    if (q.trim() && !r.email.toLowerCase().includes(q.toLowerCase()) && !r.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [rows, filter, q])

  // Clear selection whenever the view changes so stale (invisible) rows
  // can't be silently included in a bulk action.
  useEffect(() => { setSelected(new Set()) }, [filter, q])

  const isSelectable = (r: Row) => !r.isAdmin && !r.isMe
  const selectableVisible = visible.filter(isSelectable)
  const allSelectedOnPage = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id))
  const someSelectedOnPage = selectableVisible.some((r) => selected.has(r.id)) && !allSelectedOnPage

  function toggleAll() {
    const next = new Set(selected)
    if (allSelectedOnPage) selectableVisible.forEach((r) => next.delete(r.id))
    else selectableVisible.forEach((r) => next.add(r.id))
    setSelected(next)
  }
  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  function clearSelection() { setSelected(new Set()) }

  function promptQuota(r: Row) {
    const cur = r.quotaOverride > 0 ? String(r.quotaOverride) : ''
    const v = prompt(`Daily send limit for ${r.email}? Leave blank to clear override (use global env).`, cur)
    if (v === null) return
    const n = Number(v)
    start(async () => {
      setErr(null)
      const res = await setUserQuotaAction(r.id, Number.isFinite(n) ? n : 0)
      if ('error' in res && res.error) setErr(res.error)
      router.refresh()
    })
  }

  function impersonate(r: Row) {
    if (!confirm(`Sign in as ${r.email}? You will lose your admin session. Action is audit-logged.`)) return
    start(async () => {
      setErr(null)
      const res = await impersonateUserAction(r.id)
      if ('error' in res && res.error) { setErr(res.error); return }
      if ('redirect' in res && res.redirect) window.location.href = res.redirect
    })
  }

  return (
    <>
      {err ? <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
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
        <a href="/api/admin/users/export"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-foreground hover:bg-muted">
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length === rows.length ? `${rows.length} users` : `${visible.length}/${rows.length}`}
        </span>
      </div>
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => {
              setErr(null)
              const ids = selectableVisible.filter((r) => selected.has(r.id)).map((r) => r.id)
              const r = await bulkSuspendUsersAction(ids, true)
              if ('error' in r && r.error) setErr(r.error)
              clearSelection(); router.refresh()
            })}>
            <Pause className="mr-1 h-3.5 w-3.5" /> Suspend
          </Button>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => {
              setErr(null)
              const ids = selectableVisible.filter((r) => selected.has(r.id)).map((r) => r.id)
              const r = await bulkSuspendUsersAction(ids, false)
              if ('error' in r && r.error) setErr(r.error)
              clearSelection(); router.refresh()
            })}>
            <Play className="mr-1 h-3.5 w-3.5" /> Resume
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
        </div>
      ) : null}
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2">
              <input type="checkbox" aria-label="Select all"
                checked={allSelectedOnPage}
                ref={(el) => { if (el) el.indeterminate = someSelectedOnPage }}
                onChange={toggleAll}
                disabled={selectableVisible.length === 0} />
            </th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Contacts</th>
            <th className="px-3 py-2">Drafts</th>
            <th className="px-3 py-2">Events</th>
            <th className="px-3 py-2">Quota/day</th>
            <th className="px-3 py-2">Joined</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">No users match.</td></tr>
          ) : null}
          {visible.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">
                <input type="checkbox" aria-label={`Select ${r.email}`}
                  checked={selected.has(r.id)} onChange={() => toggleOne(r.id)}
                  disabled={!isSelectable(r)} />
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5">
                  {r.isAdmin ? <Shield className="h-3 w-3 text-amber-500" /> : <User className="h-3 w-3 text-muted-foreground" />}
                  {r.email}
                  {r.isMe ? <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">you</span> : null}
                </span>
              </td>
              <td className="px-3 py-2">{r.name || '—'}</td>
              <td className="px-3 py-2 tabular-nums">{r.contacts}</td>
              <td className="px-3 py-2 tabular-nums">{r.drafts}</td>
              <td className="px-3 py-2 tabular-nums">{r.events}</td>
              <td className="px-3 py-2 text-xs">
                {r.quotaOverride > 0 ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{r.quotaOverride}</span>
                ) : (
                  <span className="text-muted-foreground">default</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" aria-label="View details"
                    title="View user details" onClick={() => setDrawerUserId(r.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!r.isMe && !r.isAdmin && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Set quota"
                        title="Set per-user daily send limit" disabled={pending}
                        onClick={() => promptQuota(r)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Impersonate"
                        title="Sign in as this user (audit-logged)" disabled={pending}
                        onClick={() => impersonate(r)}>
                        <UserCog className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {r.isMe || r.isAdmin ? null : (
                    <>
                      {r.suspended ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">suspended</span> : null}
                      <Button
                        variant="ghost" size="icon"
                        aria-label={r.suspended ? 'Resume sends' : 'Suspend sends'}
                        title={r.suspended ? 'Resume — worker sends again' : 'Suspend — worker stops sending'}
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
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {drawerUserId ? (
        <UserDetailDrawer userId={drawerUserId} onClose={() => setDrawerUserId(null)} />
      ) : null}
    </>
  )
}
