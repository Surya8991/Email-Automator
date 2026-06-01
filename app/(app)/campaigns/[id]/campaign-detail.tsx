'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Pause, Play, Trash2, UserPlus, Archive, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  addStepAction, deleteCampaignAction, enrollAction,
  moveStepAction, removeStepAction, setStatusAction,
} from '@/server/actions/campaigns'
import { useFormatDate } from '@/components/timezone-provider'

interface Step { id: number; campaignId: number; order: number; templateId: number | null; delayHours: number; stopOnReply: boolean }
interface Enrollment { id: number; contactId: number; currentStep: number; nextRunAt: number; status: string }
interface StepStat {
  stepOrder: number; templateId: number | null
  sent: number; opened: number; clicked: number; replied: number; advanced: number
}
interface Props {
  campaign: { id: number; name: string; status: string }
  steps: Step[]
  enrollments: Enrollment[]
  templates: Array<{ id: number; label: string }>
  tags: string[]
  stepStats: StepStat[]
}

export function CampaignDetail({ campaign, steps, enrollments, templates, tags, stepStats }: Props) {
  const formatDate = useFormatDate()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // New step form
  const [tplId, setTplId] = useState<number | ''>(templates[0]?.id ?? '')
  const [delay, setDelay] = useState(48)
  const [stopOnReply, setStopOnReply] = useState(true)

  // Enroll form
  const [tag, setTag] = useState<string>('')

  // Enrollment filters — client-side. The list can grow into the thousands
  // once a tag-based enroll fans out, so we cap the rendered slice and let
  // the user filter to find specific rows.
  const [enrQ, setEnrQ] = useState('')
  const [enrStatus, setEnrStatus] = useState<'all' | 'active' | 'paused' | 'done' | 'errored'>('all')
  const enrStatuses = useMemo(() => Array.from(new Set(enrollments.map((e) => e.status))).sort(), [enrollments])
  const filteredEnrollments = useMemo(() => {
    const q = enrQ.trim()
    return enrollments.filter((e) => {
      if (enrStatus !== 'all' && e.status !== enrStatus) return false
      if (q && !String(e.contactId).includes(q) && !e.status.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [enrollments, enrQ, enrStatus])

  const tplName = (id: number | null) => templates.find((t) => t.id === id)?.label ?? '— deleted template —'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-1 text-xs">{campaign.status}</span>
        {campaign.status !== 'active' ? (
          <Button size="sm" disabled={pending || steps.length === 0} onClick={() => start(async () => {
            await setStatusAction(campaign.id, 'active'); router.refresh()
          })}><Play className="mr-1.5 h-4 w-4" /> Activate</Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            await setStatusAction(campaign.id, 'paused'); router.refresh()
          })}><Pause className="mr-1.5 h-4 w-4" /> Pause</Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
          await setStatusAction(campaign.id, 'archived'); router.refresh()
        })}><Archive className="mr-1.5 h-4 w-4" /> Archive</Button>
        <Button size="sm" variant="destructive" className="ml-auto" disabled={pending} onClick={() => {
          if (!confirm('Delete this campaign? Enrollments + steps go with it.')) return
          start(async () => { await deleteCampaignAction(campaign.id); router.push('/campaigns') })
        }}><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>Order them top-down. Step 1 sends immediately on enrollment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet — add one below.</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 rounded-md border p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{tplName(s.templateId)}</div>
                    <div className="text-xs text-muted-foreground">
                      Wait {s.delayHours}h after enrollment{s.stopOnReply ? ' · stops on reply' : ''}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Move up" disabled={pending || i === 0}
                    onClick={() => start(async () => { await moveStepAction(campaign.id, s.id, 'up'); router.refresh() })}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" disabled={pending || i === steps.length - 1}
                    onClick={() => start(async () => { await moveStepAction(campaign.id, s.id, 'down'); router.refresh() })}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remove step" disabled={pending}
                    onClick={() => start(async () => { await removeStepAction(campaign.id, s.id); router.refresh() })}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}

          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a template first to add steps.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-[1fr_120px_auto_auto] items-end">
              <div className="grid gap-1.5">
                <Label>Template</Label>
                <select className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={tplId} onChange={(e) => setTplId(Number(e.target.value))}>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="delay">Delay (hrs)</Label>
                <Input id="delay" type="number" min={0} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={stopOnReply} onChange={(e) => setStopOnReply(e.target.checked)} />
                Stop on reply
              </label>
              <Button disabled={pending || tplId === ''} onClick={() => start(async () => {
                const r = await addStepAction({ campaignId: campaign.id, templateId: Number(tplId), delayHours: delay, stopOnReply })
                if ('error' in r && r.error) { setMsg(r.error); return }
                setMsg('Step added'); router.refresh()
              })}>Add step</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enroll contacts</CardTitle>
          <CardDescription>Pick a tag, or leave blank to enroll every contact you have.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label>Filter by tag (optional)</Label>
              <select className="h-9 rounded-md border bg-background px-2 text-sm"
                value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">— all contacts —</option>
                {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
              </select>
            </div>
            <Button disabled={pending} onClick={() => start(async () => {
              const r = await enrollAction({ campaignId: campaign.id, tag: tag || undefined })
              if ('error' in r && r.error) { setMsg(r.error); return }
              if ('ok' in r) setMsg(`Enrolled ${r.enrolled}`)
              router.refresh()
            })}><UserPlus className="mr-1.5 h-4 w-4" /> Enroll</Button>
          </div>

          {/* Per-step performance — counts sent/open/click/reply per step
              from the events table, plus the share of enrollments that
              advanced past this step. Rates are computed off sent so an
              un-fired step shows zeros instead of dividing by zero. */}
          {stepStats.length > 0 ? (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Step performance</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-1">Step</th>
                    <th className="p-1">Template</th>
                    <th className="p-1 text-right">Sent</th>
                    <th className="p-1 text-right">Opens</th>
                    <th className="p-1 text-right">Clicks</th>
                    <th className="p-1 text-right">Replies</th>
                    <th className="p-1 text-right">Advanced</th>
                  </tr>
                </thead>
                <tbody>
                  {stepStats.map((s) => {
                    const pct = (n: number) => s.sent > 0 ? ` (${Math.round((n / s.sent) * 100)}%)` : ''
                    return (
                      <tr key={s.stepOrder} className="border-t">
                        <td className="p-1 font-medium">#{s.stepOrder + 1}</td>
                        <td className="p-1 text-xs text-muted-foreground">{tplName(s.templateId)}</td>
                        <td className="p-1 text-right tabular-nums">{s.sent}</td>
                        <td className="p-1 text-right tabular-nums">{s.opened}<span className="text-xs text-muted-foreground">{pct(s.opened)}</span></td>
                        <td className="p-1 text-right tabular-nums">{s.clicked}<span className="text-xs text-muted-foreground">{pct(s.clicked)}</span></td>
                        <td className="p-1 text-right tabular-nums">{s.replied}<span className="text-xs text-muted-foreground">{pct(s.replied)}</span></td>
                        <td className="p-1 text-right tabular-nums">{s.advanced}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Active enrollments ({enrollments.filter(e => e.status === 'active').length}/{enrollments.length})</h3>
            {enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts enrolled yet.</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="relative max-w-xs flex-1">
                    <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={enrQ} onChange={(e) => setEnrQ(e.target.value)}
                      placeholder="Search contact # or status…" className="h-7 pl-7 text-xs" />
                  </div>
                  <select value={enrStatus} onChange={(e) => setEnrStatus(e.target.value as typeof enrStatus)}
                    className="h-7 rounded-md border bg-background px-2 text-xs">
                    <option value="all">All statuses</option>
                    {enrStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {filteredEnrollments.length === enrollments.length
                      ? `${enrollments.length} total`
                      : `${filteredEnrollments.length}/${enrollments.length}`}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-1">Contact</th><th className="p-1">Step</th><th className="p-1">Next run</th><th className="p-1">Status</th></tr>
                  </thead>
                  <tbody>
                    {filteredEnrollments.slice(0, 200).map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="p-1 font-mono text-xs">#{e.contactId}</td>
                        <td className="p-1">{e.currentStep + 1} / {steps.length}</td>
                        <td className="p-1 text-muted-foreground">{formatDate(e.nextRunAt)}</td>
                        <td className="p-1 text-xs text-muted-foreground">{e.status}</td>
                      </tr>
                    ))}
                    {filteredEnrollments.length === 0 ? (
                      <tr><td colSpan={4} className="p-3 text-center text-xs text-muted-foreground">No enrollments match.</td></tr>
                    ) : null}
                  </tbody>
                </table>
                {filteredEnrollments.length > 200 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Showing first 200 of {filteredEnrollments.length} — narrow the filter to see more.</p>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
