'use client'
import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

// Tiny client-side presence pill. Pings POST /api/presence/[resource]
// every 30 s and shows the count of other peers currently viewing the
// same resource. "(approx)" tag makes the per-Lambda caveat visible.

interface Peer { email: string; ageSec: number }

const HEARTBEAT_MS = 30_000

export function PresencePill({ resource }: { resource: string }) {
  const [peers, setPeers] = useState<Peer[]>([])

  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        const r = await fetch(`/api/presence/${encodeURIComponent(resource)}`, { method: 'POST' })
        if (!r.ok) return
        const { peers } = (await r.json()) as { peers: Peer[] }
        if (!cancelled) setPeers(peers ?? [])
      } catch { /* network blip — try again next tick */ }
    }

    ping()
    const id = setInterval(ping, HEARTBEAT_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [resource])

  if (peers.length === 0) return null
  // We mask emails to local-part only — the full address would be a
  // small leak across teams when multiple users share a tenant.
  const names = peers.slice(0, 3).map((p) => p.email.split('@')[0]).join(', ')
  const extra = peers.length > 3 ? ` +${peers.length - 3}` : ''
  return (
    <span
      title={`${peers.length} other ${peers.length === 1 ? 'person' : 'people'} viewing this — approximate (per-instance presence)`}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ea-fade-in"
    >
      <Users className="h-3 w-3" />
      {names}{extra}
      <span className="opacity-60">(approx)</span>
    </span>
  )
}
