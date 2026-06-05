'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sparkles, Filter, Users, Clock, FileText, ChevronRight, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createDraftsAction, previewEligibleDraftsAction } from '@/server/actions/drafts'

export interface TemplateOption {
  id: number
  key: string
  label: string
  category: string
  active: boolean
}

const COUNT_PRESETS = [5, 10, 25, 50] as const
const RECENT_DAYS = [7, 14, 30, 90] as const
const PLATFORMS = ['LinkedIn', 'Naukri', 'Email', 'Other'] as const

interface Preview {
  eligible: number
  total: number
  sample: Array<{ id: number; recruiterName: string; company: string; recruiterEmail: string; jobTitle: string; platform: string }>
}

export function CreateDraftsDialog({
  templates,
  trigger,
}: {
  templates: TemplateOption[]
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  // Form state, kept inside the dialog so closing and reopening
  // starts from the user's defaults again (active template, 10 drafts).
  const activeId = templates.find((t) => t.active)?.id ?? templates[0]?.id ?? null
  const [templateId, setTemplateId] = useState<number | null>(activeId)
  const [count, setCount] = useState<number>(10)
  const [platforms, setPlatforms] = useState<string[]>([])
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skipRecentEnabled, setSkipRecentEnabled] = useState(false)
  const [skipRecentDays, setSkipRecentDays] = useState<number>(30)

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced live preview. Refetch on any filter change while the
  // dialog is open. 30/min rate limit on the server side as backstop;
  // the 350ms debounce keeps the typed-into-jobTitle case sane.
  const filters = useMemo(() => ({
    platforms: platforms.length > 0 ? platforms : undefined,
    jobTitleContains: jobTitle.trim() || undefined,
    locationContains: location.trim() || undefined,
    skipRecentDays: skipRecentEnabled ? skipRecentDays : undefined,
  }), [platforms, jobTitle, location, skipRecentEnabled, skipRecentDays])

  useEffect(() => {
    if (!open) return
    if (debounce.current) clearTimeout(debounce.current)
    // Defer the setPreviewLoading inside the timeout so we don't call
    // setState synchronously during effect, would otherwise cascade
    // a re-render before the debounce window even starts.
    debounce.current = setTimeout(async () => {
      setPreviewLoading(true)
      const r = await previewEligibleDraftsAction(filters)
      if ('error' in r && r.error) {
        // Don't toast, rate-limit error during fast typing is OK.
        setPreviewLoading(false)
        return
      }
      if ('eligible' in r) {
        setPreview({ eligible: r.eligible, total: r.total, sample: r.sample })
        setPreviewLoading(false)
      }
    }, 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [filters, open])

  const eligible = preview?.eligible ?? 0
  const effectiveCount = Math.min(50, Math.max(1, count | 0 || 1))
  const willCreate = Math.min(effectiveCount, eligible)
  const noTemplates = templates.length === 0

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  function reset() {
    setTemplateId(activeId)
    setCount(10)
    setPlatforms([])
    setJobTitle('')
    setLocation('')
    setSkipRecentEnabled(false)
    setSkipRecentDays(30)
  }

  function submit() {
    start(async () => {
      const r = await createDraftsAction({
        count: effectiveCount,
        templateId: templateId ?? undefined,
        filters,
      })
      if ('error' in r && r.error) { toast.error(r.error); return }
      if ('processed' in r) {
        const skipped = ('total' in r ? r.total : 0) - r.processed
        toast.success(
          skipped > 0
            ? `Created ${r.processed} drafts · ${skipped} skipped (already drafted or sent)`
            : `Created ${r.processed} drafts`,
        )
      }
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Sparkles className="mr-1.5 h-4 w-4" /> New drafts
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create drafts
          </DialogTitle>
          <DialogDescription>
            Generate personalized drafts for a slice of your contacts. Filters narrow the audience; the live counter shows who matches before you commit.
          </DialogDescription>
        </DialogHeader>

        {noTemplates ? (
          <div className="rounded-md border border-warn bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            You don&apos;t have any templates yet. Create one in <a href="/templates" className="underline">/templates</a> first, drafts pull subject + body from a template.
          </div>
        ) : (
          <div className="grid gap-5">
            {/* Template picker */}
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3 w-3" /> Template
              </Label>
              <select
                value={templateId ?? ''}
                onChange={(e) => setTemplateId(Number(e.target.value) || null)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {(t.active ? '★ ' : '') + (t.label || t.key)}{t.category ? ` · ${t.category}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Picking a different template here doesn&apos;t change your active one, it&apos;s a one-off override for this batch.
              </p>
            </div>

            {/* Count presets */}
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Users className="h-3 w-3" /> How many
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {COUNT_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm ea-transition',
                      count === n ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={50}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 1)}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">max 50/batch</span>
                </div>
              </div>
            </div>

            {/* Filter section */}
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Filter className="h-3 w-3" /> Audience filters <span className="text-[10px] normal-case opacity-70">(all optional)</span>
              </div>

              {/* Platform chips */}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Platform</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p)
                    return (
                      <button
                        key={p} type="button"
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs ea-transition',
                          on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                        )}
                        aria-pressed={on}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Job title + location contains */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="cd-job" className="text-xs text-muted-foreground">Job title contains</Label>
                  <Input id="cd-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. product manager" className="h-8 text-sm" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="cd-loc" className="text-xs text-muted-foreground">Location contains</Label>
                  <Input id="cd-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. bangalore" className="h-8 text-sm" />
                </div>
              </div>

              {/* Skip recent */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox" className="h-4 w-4 accent-primary"
                    checked={skipRecentEnabled}
                    onChange={(e) => setSkipRecentEnabled(e.target.checked)}
                  />
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Skip contacts I emailed in the last
                </label>
                <select
                  value={skipRecentDays}
                  onChange={(e) => setSkipRecentDays(Number(e.target.value))}
                  disabled={!skipRecentEnabled}
                  className="h-7 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
                >
                  {RECENT_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  <span className="font-semibold tabular-nums">{preview?.eligible ?? '—'}</span>
                  <span className="text-muted-foreground">eligible</span>
                  {preview ? (
                    <span className="text-xs text-muted-foreground">· of {preview.total} total contacts</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Will create <span className="font-medium text-foreground tabular-nums">{willCreate}</span>
                </div>
              </div>
              {preview && preview.sample.length > 0 ? (
                <ul className="mt-2 divide-y rounded-md border bg-background/60 text-xs">
                  {preview.sample.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{s.recruiterName || '(no name)'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="truncate text-muted-foreground">{s.company}</span>
                      <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{s.recruiterEmail}</span>
                    </li>
                  ))}
                </ul>
              ) : preview && preview.eligible === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No contacts match. Loosen the filters above, or import contacts first.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={pending || noTemplates || willCreate === 0}
          >
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Create {willCreate || effectiveCount} draft{willCreate === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
