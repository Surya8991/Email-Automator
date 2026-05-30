'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Eye, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cancelScheduleAction, enqueueScheduleAction, previewScheduleAction } from '@/server/actions/schedule'
import { formatDate } from '@/lib/utils'

interface QueueRow { id: number; email: string; subject: string; scheduledAt: string; status: string }
interface Preview { email: string; name: string; company: string; subject: string; scheduledAt: string }

function tomorrow930() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0)
  return { date: d.toISOString().slice(0, 10), time: '09:30' }
}

export function ScheduleClient({ queue, queueCount }: { queue: QueueRow[]; queueCount: number }) {
  const router = useRouter()
  const init = tomorrow930()
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState(init.time)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<{ total: number; firstAt: string; lastAt: string; preview: Preview[] } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="date">Start date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="time">Start time</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          setMsg(null); setPreview(null)
          const r = await previewScheduleAction({ startDate: date, startTime: time })
          if ('error' in r && r.error) { setMsg(r.error); return }
          if ('total' in r) setPreview(r)
        })}>
          <Eye className="mr-1.5 h-4 w-4" /> Preview
        </Button>
        <Button disabled={pending} onClick={() => start(async () => {
          if (!confirm('Schedule all eligible contacts starting at that time?')) return
          setMsg(null)
          const r = await enqueueScheduleAction({ startDate: date, startTime: time })
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
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            {preview.total} contacts · first {formatDate(preview.firstAt)} · last {formatDate(preview.lastAt)} (IST)
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
              <tr><th className="p-2">Run at</th><th className="p-2">To</th><th className="p-2">Subject</th><th className="p-2">Status</th></tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{formatDate(r.scheduledAt)}</td>
                  <td className="p-2 font-mono text-xs">{r.email}</td>
                  <td className="p-2 truncate max-w-xs">{r.subject}</td>
                  <td className="p-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
