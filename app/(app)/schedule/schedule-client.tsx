'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Eye, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cancelScheduleAction, enqueueScheduleAction, previewScheduleAction } from '@/server/actions/schedule'
import { useFormatDate, useTimezone } from '@/components/timezone-provider'

interface QueueRow {
  id: number; email: string; subject: string; scheduledAt: string; status: string
  attempts: number; lastResult: string
}
interface Preview { email: string; name: string; company: string; subject: string; scheduledAt: string }
interface PreviewResp {
  total: number; firstAt: string; lastAt: string
  intervalMin: number; intervalMax: number; preview: Preview[]
}

function tomorrow930() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0)
  return { date: d.toISOString().slice(0, 10), time: '09:30' }
}

// Recurring schedule presets — pick a future date that matches the
// pattern starting from `from` (typically today). All return YYYY-MM-DD.
function nextWeekday(from: Date): string {
  const d = new Date(from); d.setDate(d.getDate() + 1)
  // Skip Sat (6) / Sun (0) until Mon-Fri
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function nextMonday(from: Date): string {
  const d = new Date(from); d.setDate(d.getDate() + 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function inDays(from: Date, n: number): string {
  const d = new Date(from); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

interface Preset { label: string; date: string; time: string; hint: string }
function buildPresets(): Preset[] {
  const now = new Date()
  return [
    { label: 'Tomorrow 9:30 AM', date: inDays(now, 1), time: '09:30', hint: 'Standard outreach window' },
    { label: 'Next weekday 10:00 AM', date: nextWeekday(now), time: '10:00', hint: 'Skips weekends' },
    { label: 'Next Monday 9:00 AM', date: nextMonday(now), time: '09:00', hint: 'Start of week' },
    { label: 'In 3 days, 11:00 AM', date: inDays(now, 3), time: '11:00', hint: 'Give yourself buffer' },
    { label: 'Tonight 7:00 PM', date: inDays(now, 0), time: '19:00', hint: 'Post-work hours' },
  ]
}

export function ScheduleClient({ queue, queueCount }: { queue: QueueRow[]; queueCount: number }) {
  const formatDate = useFormatDate()
  const tz = useTimezone()
  const router = useRouter()
  const init = tomorrow930()
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState(init.time)
  // Stagger between sends — defaults match the previous hardcoded 3-5 min
  // window so existing behavior is unchanged unless the user picks new
  // values. min must be <= max; we let the form save either way and the
  // server normalizes.
  const [intervalMin, setIntervalMin] = useState(3)
  const [intervalMax, setIntervalMax] = useState(5)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const presets = buildPresets()

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <span className="font-medium text-muted-foreground">Presets:</span>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setDate(p.date); setTime(p.time) }}
            title={p.hint}
            className="rounded-md border bg-background px-2 py-1 hover:bg-accent"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="date">Start date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="time">Start time</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="imin">Gap min (min)</Label>
          <Input id="imin" type="number" min={0} max={240} value={intervalMin}
            onChange={(e) => setIntervalMin(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
            className="w-24" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="imax">Gap max (min)</Label>
          <Input id="imax" type="number" min={0} max={240} value={intervalMax}
            onChange={(e) => setIntervalMax(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
            className="w-24" />
        </div>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          setMsg(null); setPreview(null)
          const r = await previewScheduleAction({ startDate: date, startTime: time, intervalMin, intervalMax })
          if ('error' in r && r.error) { setMsg(r.error); return }
          if ('total' in r) setPreview(r)
        })}>
          <Eye className="mr-1.5 h-4 w-4" /> Preview
        </Button>
        <Button disabled={pending} onClick={() => start(async () => {
          if (!confirm('Schedule all eligible contacts starting at that time?')) return
          setMsg(null)
          const r = await enqueueScheduleAction({ startDate: date, startTime: time, intervalMin, intervalMax })
          if ('error' in r && r.error) { setMsg(r.error); return }
          if ('ok' in r) setMsg(`Scheduled ${r.scheduled}`)
          setPreview(null)
          router.refresh()
        })}>
          <Play className="mr-1.5 h-4 w-4" /> Schedule
        </Button>
        {queueCount > 0 ? (
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
            if (!confirm(`Cancel all ${queueCount} scheduled emails?`)) return
            const r = await cancelScheduleAction()
            setMsg(`Cancelled ${r.cancelled}`)
            router.refresh()
          })}>
            <X className="mr-1.5 h-4 w-4" /> Cancel all
          </Button>
        ) : null}
        {msg ? <span className="ml-auto text-sm text-muted-foreground">{msg}</span> : null}
      </div>

      {preview ? (
        <div className="border-b bg-muted/30 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            <span>{preview.total} contacts</span>
            <span className="text-muted-foreground">·</span>
            <span>first {formatDate(preview.firstAt)}</span>
            <span className="text-muted-foreground">·</span>
            <span>last {formatDate(preview.lastAt)} ({tzShort(tz)})</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              spacing {preview.intervalMin === preview.intervalMax
                ? `${preview.intervalMin} min`
                : `${preview.intervalMin}–${preview.intervalMax} min`} between sends
            </span>
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left p-1">Time</th><th className="text-left p-1">To</th><th className="text-left p-1">Subject</th></tr>
            </thead>
            <tbody>
              {preview.preview.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1 whitespace-nowrap">{formatDate(p.scheduledAt)}</td>
                  <td className="p-1 font-mono">{p.email}</td>
                  <td className="p-1 truncate max-w-xs">{p.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="p-4">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Queue ({queueCount})</h2>
        {queue.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Run at</th>
                <th className="p-2">To</th>
                <th className="p-2">Subject</th>
                <th className="p-2">Status</th>
                <th className="p-2">Attempts</th>
                <th className="p-2">Last result</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{formatDate(r.scheduledAt)}</td>
                  <td className="p-2 font-mono text-xs">{r.email}</td>
                  <td className="p-2 truncate max-w-xs">{r.subject}</td>
                  <td className="p-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      r.status === 'Retrying' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted'
                    }`}>{r.status}</span>
                  </td>
                  <td className="p-2 text-xs tabular-nums">{r.attempts || 0}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate max-w-[16rem]" title={r.lastResult}>
                    {r.lastResult || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Render "Asia/Kolkata" → "Kolkata". Cosmetic label next to preview times
// so the user knows which TZ they're seeing without reading the full IANA id.
function tzShort(tz: string): string {
  const tail = tz.split('/').pop() ?? tz
  return tail.replace(/_/g, ' ')
}
