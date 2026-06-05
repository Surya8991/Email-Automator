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
  const [quotaTarget, setQuotaTarget] = useState<Row | null>(null)
  const [quotaInput, setQuotaInput] = useState('')
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

  function openQuotaDialog(r: Row) {
    setQuotaTarget(r)
    setQuotaInput(r.quotaOverride > 0 ? String(r.quotaOverride) : '')
  }
  function submitQuota() {
    if (!quotaTarget) return
    const trimmed = quotaInput.trim()
    const n = trimmed === '' ? 0 : Number(trimmed)
    if (trimmed !== '' && (!Number.isFinite(n) || n < 0)) {
      setErr('Quota must be a positive integer (or blank to clear).')
      return
    }
    const target = quotaTarget
    setQuotaTarget(null)
    start(async () => {
      setErr(null)
      const res = await setUserQuotaAction(target.id, n)
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
      {/* Mobile: card layout. Same data, stacked + actions in a single
          row. Triggers under md; the desktop table below is hidden under md. */}
      <ul className="divide-y md:hidden">
        {visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No users match.</li>
        ) : null}
        {visible.map((r) => (
          <li key={r.id} className="space-y-2 p-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" aria-label={`Select ${r.email}`}
                checked={selected.has(r.id)} onChange={() => toggleOne(r.id)}
                disabled={!isSelectable(r)} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate font-mono text-xs">
                  {r.isAdmin ? <Shield className="h-3 w-3 shrink-0 text-amber-500" /> : <User className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{r.email}</span>
                  {r.isMe ? <span className="shrink-0 rounded bg-primary/10 px-1.5 text-[10px] text-primary">you</span> : null}
                  {r.suspended ? <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">suspended</span> : null}
                </div>
                <div className="text-xs text-muted-foreground">{r.name || '—'} · joined {formatDate(r.createdAt)}</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded bg-muted/30 py-1">
                <div className="text-[10px] uppercase text-muted-foreground">Contacts</div>
                <div className="font-medium tabular-nums">{r.contacts}</div>
              </div>
              <div className="rounded bg-muted/30 py-1">
                <div className="text-[10px] uppercase text-muted-foreground">Drafts</div>
                <div className="font-medium tabular-nums">{r.drafts}</div>
              </div>
              <div className="rounded bg-muted/30 py-1">
                <div className="text-[10px] uppercase text-muted-foreground">Events</div>
                <div className="font-medium tabular-nums">{r.events}</div>
              </div>
              <div className="rounded bg-muted/30 py-1">
                <div className="text-[10px] uppercase text-muted-foreground">Quota</div>
                <div className="font-medium tabular-nums">
                  {r.quotaOverride > 0 ? r.quotaOverride : <span className="text-muted-foreground">env</span>}
                </div>
              </div>
            </div>
            <div className="-mx-1 flex flex-wrap items-center gap-0.5">
              <Button variant="ghost" size="icon" aria-label="View details" onClick={() => setDrawerUserId(r.id)}>
                <Eye className="h-4 w-4" />
              </Button>
              {!r.isMe && !r.isAdmin && (
                <>
                  <Button variant="ghost" size="icon" aria-label="Set quota" disabled={pending} onClick={() => openQuotaDialog(r)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Impersonate" disabled={pending} onClick={() => impersonate(r)}>
                    <UserCog className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={r.suspended ? 'Resume sends' : 'Suspend sends'}
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
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
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
                        onClick={() => openQuotaDialog(r)}>
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
      {quotaTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-base font-semibold">Set daily send limit</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Override the global <code>DAILY_SEND_LIMIT</code> for <span className="font-mono">{quotaTarget.email}</span>.
              Leave blank to clear the override and fall back to the env default.
            </p>
            <Input
              type="number" inputMode="numeric" min={0}
              autoFocus
              value={quotaInput}
              onChange={(e) => setQuotaInput(e.target.value)}
              placeholder="e.g. 100"
              className="mt-4"
              onKeyDown={(e) => { if (e.key === 'Enter') submitQuota() }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={pending}
                onClick={() => setQuotaTarget(null)}>Cancel</Button>
              <Button size="sm" disabled={pending} onClick={submitQuota}>
                {quotaInput.trim() === '' ? 'Clear override' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
