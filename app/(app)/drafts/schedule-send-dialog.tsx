'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scheduleSelectedDraftsAction } from '@/server/actions/drafts'

// Default starts 5 minutes in the future so the picker doesn't open in
// the past by the time the user clicks Schedule.
function defaultStartLocal(): string {
  const d = new Date(Date.now() + 5 * 60_000)
  // Format as YYYY-MM-DDTHH:mm in *local* time. datetime-local inputs
  // expect that exact shape and interpret it as the user's tz.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleSendDialog({
  draftIds,
  open,
  onOpenChange,
  onScheduled,
}: {
  draftIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onScheduled?: () => void
}) {
  const router = useRouter()
  const [startAt, setStartAt] = useState<string>(defaultStartLocal())
  const [intervalMin, setIntervalMin] = useState<number>(3)
  const [intervalMax, setIntervalMax] = useState<number>(5)
  const [pending, start] = useTransition()

  function submit() {
    const ms = new Date(startAt).getTime()
    if (!Number.isFinite(ms)) { toast.error('Invalid date'); return }
    if (ms < Date.now() - 60_000) {
      if (!confirm('Start time is in the past — the scheduler will pick these up on the next tick. Continue?')) return
    }
    const lo = Math.max(0, Math.min(intervalMin, intervalMax))
    const hi = Math.max(0, Math.max(intervalMin, intervalMax))
    start(async () => {
      const r = await scheduleSelectedDraftsAction(draftIds, {
        startAt: ms, intervalMin: lo, intervalMax: hi,
      })
      if ('error' in r && r.error) { toast.error(r.error); return }
      if ('scheduled' in r) {
        const skipped = r.skipped ?? 0
        toast.success(
          skipped > 0
            ? `Scheduled ${r.scheduled} · ${skipped} skipped`
            : `Scheduled ${r.scheduled} draft${r.scheduled === 1 ? '' : 's'}`,
        )
      }
      onOpenChange(false)
      onScheduled?.()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Schedule {draftIds.length} draft{draftIds.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            Convert these drafts into scheduled sends. The first email lands at the start time; the rest follow with a random stagger in your interval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ss-start">Start at</Label>
            <Input
              id="ss-start" type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">In your local timezone.</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm">Stagger between sends</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="number" min={0} max={60}
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value) || 0)}
                className="h-8 w-20" aria-label="Minimum interval minutes"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number" min={0} max={60}
                value={intervalMax}
                onChange={(e) => setIntervalMax(Number(e.target.value) || 0)}
                className="h-8 w-20" aria-label="Maximum interval minutes"
              />
              <span className="text-xs text-muted-foreground">minutes between each</span>
            </div>
            <p className="text-xs text-muted-foreground">
              3–5 min is the default — slow enough that Gmail/Outlook don&apos;t flag the burst, fast enough that {draftIds.length} drafts clear in under {Math.ceil((draftIds.length * 4) / 60)} h.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || draftIds.length === 0}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1.5 h-4 w-4" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
