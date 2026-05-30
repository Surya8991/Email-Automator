'use client'
import { useEffect, useState } from 'react'

// useProgress() opens an SSE connection to /api/progress and surfaces the
// most recent event. Auto-reconnects on close with a short backoff so a
// browser hiccup doesn't strand the UI.
export interface ProgressEvent { type: string; processed?: number; total?: number; email?: string }

export function useProgress(): ProgressEvent | null {
  const [evt, setEvt] = useState<ProgressEvent | null>(null)
  useEffect(() => {
    let es: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    const open = () => {
      es = new EventSource('/api/progress')
      es.onmessage = (e) => {
        try { setEvt(JSON.parse(e.data) as ProgressEvent) } catch { /* ignore */ }
      }
      es.onerror = () => {
        es?.close()
        if (closed) return
        timer = setTimeout(open, 2000)
      }
    }
    open()
    return () => { closed = true; es?.close(); if (timer) clearTimeout(timer) }
  }, [])
  return evt
}
