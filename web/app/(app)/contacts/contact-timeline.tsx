'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Contact } from '@/server/db/schema'
import { fetchTimelineAction, type TimelineItem } from '@/server/actions/timeline'
import { formatDate } from '@/lib/utils'

export function ContactTimeline({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchTimelineAction(contact.id).then((r) => {
      if (!alive) return
      if ('error' in r && r.error) setErr(r.error)
      else if ('items' in r) setItems(r.items)
    })
    return () => { alive = false }
  }, [contact.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">{contact.recruiterName || contact.recruiterEmail}</h2>
            <p className="text-xs text-muted-foreground font-mono">{contact.recruiterEmail}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4">
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          {!items && !err ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {items && items.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
          {items && items.length > 0 ? (
            <ol className="space-y-3">
              {items.map((it, i) => (
                <li key={i} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{it.label}</div>
                    {it.detail ? <div className="text-xs text-muted-foreground">{it.detail}</div> : null}
                    <div className="text-xs text-muted-foreground">{formatDate(it.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  )
}
