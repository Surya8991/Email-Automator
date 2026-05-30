'use client'
import { useEffect, useState } from 'react'
import type { Contact } from '@/server/db/schema'
import { fetchTimelineAction, type TimelineItem } from '@/server/actions/timeline'
import { useFormatDate } from '@/components/timezone-provider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ContactTimeline({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const formatDate = useFormatDate()
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

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact.recruiterName || contact.recruiterEmail}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{contact.recruiterEmail}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto pt-2">
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
                    {it.detail ? <div className="text-xs text-muted-foreground break-all">{it.detail}</div> : null}
                    <div className="text-xs text-muted-foreground">{formatDate(it.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
