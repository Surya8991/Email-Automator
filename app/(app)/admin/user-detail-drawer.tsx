'use client'
import { useEffect, useState } from 'react'
import { X, Mail, CalendarClock, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUserDetailAction } from '@/server/actions/admin'
import { useFormatDate } from '@/components/timezone-provider'
import type { userDetail } from '@/server/services/admin-analytics'

type Detail = NonNullable<Awaited<ReturnType<typeof userDetail>>>

export function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const fmt = useFormatDate()
  const [data, setData] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getUserDetailAction(userId).then((r) => {
      if (cancelled) return
      if ('error' in r) setErr(r.error ?? 'Failed to load')
      else setData(r.data as Detail)
    })
    return () => { cancelled = true }
  }, [userId])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">User detail</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4 text-sm">
          {err && <p className="rounded bg-destructive/10 px-3 py-2 text-destructive">{err}</p>}
          {!data && !err && (
            <p className="text-muted-foreground">Loading…</p>
          )}
          {data && (
            <>
              <section className="space-y-1">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{data.user.email}</span>
                </div>
                {data.user.name && <div className="text-xs text-muted-foreground">{data.user.name}</div>}
                <div className="text-xs text-muted-foreground">Joined {fmt(data.user.createdAt)}</div>
                {data.settings.paused && (
                  <div className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                    <Pause className="h-3 w-3" /> Sends paused
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">30-day activity</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Sent" v={data.counts.sent30} />
                  <Stat label="Opens" v={data.counts.opens30} />
                  <Stat label="Clicks" v={data.counts.clicks30} />
                  <Stat label="Replies" v={data.counts.replies30} />
                  <Stat label="Bounces" v={data.counts.bounces30} />
                  <Stat label="Queued" v={data.counts.queued} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Inventory</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Contacts" v={data.counts.contacts} />
                  <Stat label="Drafts" v={data.counts.draftsPending} />
                  <Stat label="Campaigns" v={data.counts.activeCampaigns} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Settings</h3>
                <dl className="space-y-1 text-xs">
                  <Row k="Daily limit override" v={data.settings.dailyLimitOverride || '— (uses env default)'} />
                  <Row k="Per-recipient throttle" v={data.settings.throttleDays ? `${data.settings.throttleDays}d` : 'disabled'} />
                  <Row k="Per-domain caps" v={data.settings.domainCap || '— (none)'} />
                  <Row k="Last sent" v={data.lastSentAt ? fmt(data.lastSentAt) : 'never'} />
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recent sends (10)</h3>
                {data.recentSends.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sends yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.recentSends.map((s) => (
                      <li key={s.id} className="rounded border bg-muted/20 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono">{s.recipient}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                            s.status === 'Sent' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : s.status === 'Failed' ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : s.status === 'Cancelled' ? 'bg-muted text-muted-foreground'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          }`}>{s.status}</span>
                        </div>
                        <div className="mt-0.5 truncate text-muted-foreground" title={s.subject}>{s.subject}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <CalendarClock className="h-3 w-3" />
                          {fmt(s.scheduledAt)}
                          {s.lastResult && <span className="ml-1 truncate" title={s.lastResult}>· {s.lastResult}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded border bg-muted/20 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{v}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-mono" title={v}>{v}</dd>
    </div>
  )
}
