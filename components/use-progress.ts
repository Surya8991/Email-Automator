'use client'
import { useEffect, useRef, useState } from 'react'

// useProgress() surfaces the most recent server-side progress event.
//
// Transport strategy:
//   - Opens an EventSource against /api/progress (works on self-hosted /
//     single-instance setups where the emitter shares the SSE process).
//   - Also polls /api/progress/poll?since=… every 2s as a fallback. On
//     Vercel the SSE socket can connect but the emitter Lambda is a
//     different process so events never arrive over SSE; polling fills
//     the gap. On self-hosted both paths fire and dedupe by timestamp.
export interface ProgressEvent {
  type: string
  processed?: number
  total?: number
  email?: string
  // Contact-import events only — populated on contact_import_done.
  duplicates?: number
  rejected?: number
}

const POLL_INTERVAL_MS = 2000

export function useProgress(): ProgressEvent | null {
  const [evt, setEvt] = useState<ProgressEvent | null>(null)
  // Tracks the timestamp of the most recently observed event so the polling
  // endpoint can short-circuit when we're already up to date.
  const lastSeen = useRef(0)

  useEffect(() => {
    let closed = false
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const apply = (data: ProgressEvent, at?: number) => {
      // Dedupe — both transports may deliver the same event milliseconds apart.
      if (at !== undefined && at <= lastSeen.current) return
      if (at !== undefined) lastSeen.current = at
      setEvt(data)
    }

    const openSse = () => {
      es = new EventSource('/api/progress')
      es.onmessage = (e) => {
        try {
          // SSE payload is { at: number, data: ProgressEvent } — same shape
          // as the polling fallback so both transports use the server-issued
          // timestamp for dedup instead of the client clock.
          const wrapper = JSON.parse(e.data) as { at?: number; data?: ProgressEvent }
          if (wrapper?.data) apply(wrapper.data, wrapper.at)
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        es?.close()
        if (closed) return
        reconnectTimer = setTimeout(openSse, 2000)
      }
    }

    const poll = async () => {
      if (closed) return
      try {
        const res = await fetch(`/api/progress/poll?since=${lastSeen.current}`, { cache: 'no-store' })
        if (res.status === 204 || !res.ok) return
        const j = (await res.json()) as { at: number; data: ProgressEvent }
        if (j?.data) apply(j.data, j.at)
      } catch { /* network blip — try again next tick */ }
    }

    openSse()
    pollTimer = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      closed = true
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [])
  return evt
}
