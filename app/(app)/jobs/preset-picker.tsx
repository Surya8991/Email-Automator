'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Zap, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { JOB_BOARD_PRESETS, PRESET_CATEGORIES, buildPresetUrl, splitRoles, type JobBoardPreset } from '@/lib/job-board-presets'
import { addJobSourceAction } from '@/server/actions/job-tracker'
import { cn } from '@/lib/utils'

// Preset-driven add-source flow. The user picks a board, fills in
// role + (optional) location, and we generate the URL + label +
// suggested keywords automatically. Saves several clicks vs the raw
// add-source dialog. Both flows go through the same server action
// (which re-validates URL via fetchForAi for SSRF defense).

export function JobPresetPicker() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<JobBoardPreset | null>(null)
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [pending, start] = useTransition()

  function reset() {
    setPicked(null); setRole(''); setLocation('')
  }

  function submit() {
    if (!picked) return
    // Belt-and-braces guard against a double-click squeaking through
    // before React commits the disabled prop on the first transition.
    if (pending) return
    // Multi-role mode: a comma-separated role string creates one
    // job source per role. Single-role mode is the same code path
    // with a 1-item array, so we don't branch on the count.
    const roles = splitRoles(role)
    if (roles.length === 0) { toast.error('Enter at least one role'); return }
    if (roles.length > 10) { toast.error('Up to 10 roles per batch, split into multiple submissions'); return }
    start(async () => {
      let ok = 0
      const errors: string[] = []
      // Track which roles succeeded so a partial failure can drop
      // those from the input and let the user retry only the failing
      // ones without re-firing the successful (and now duplicate) ones.
      const succeeded = new Set<string>()
      for (const r of roles) {
        const { url, label, keywords } = buildPresetUrl(picked, r, location)
        if (!url || url.length < 8) { errors.push(`${r}: URL too short`); continue }
        const res = await addJobSourceAction({ label, url, keywords })
        if ('error' in res && res.error) { errors.push(`${r}: ${res.error}`); continue }
        ok++; succeeded.add(r)
      }
      if (ok === roles.length) {
        // All clear, close the dialog.
        toast.success(
          roles.length === 1
            ? `Added "${buildPresetUrl(picked, roles[0]!, location).label}". Refresh to pull the first leads.`
            : `Added ${ok} sources. Refresh to pull the first leads.`,
        )
        setOpen(false); reset()
        router.refresh()
        return
      }
      // Partial success: surface the count, drop succeeded roles from
      // the input so re-submit hits only the remaining ones.
      if (ok > 0) {
        toast.success(`Added ${ok} of ${roles.length}. ${roles.length - ok} still to retry.`)
        const remaining = roles.filter((r) => !succeeded.has(r)).join(', ')
        setRole(remaining)
        router.refresh()
      }
      if (errors.length > 0) {
        toast.error(errors.slice(0, 3).join(' · ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ''))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Zap className="mr-1.5 h-4 w-4" /> Add from preset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from a popular board</DialogTitle>
          <DialogDescription>
            Pick a job board, fill in the role and location, and we&apos;ll generate the URL. The SSRF-defended fetcher still validates whatever URL we end up with.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {PRESET_CATEGORIES.map((cat) => {
              const inCat = JOB_BOARD_PRESETS.filter((p) => p.category === cat.id)
              if (inCat.length === 0) return null
              const featured = Boolean(cat.featured)
              return (
                <div key={cat.id} className={featured ? 'rounded-xl border border-primary/30 bg-primary/5 p-3' : ''}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {cat.label}
                    </div>
                    {featured ? (
                      <span className="inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                        Recommended
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground/70">{inCat.length} {inCat.length === 1 ? 'board' : 'boards'}</span>
                  </div>
                  <div className="mb-2 text-[11px] text-muted-foreground/80">{cat.blurb}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {inCat.map((p) => (
                      <button
                        key={p.id} type="button"
                        onClick={() => setPicked(p)}
                        className={cn(
                          'flex items-start gap-3 rounded-lg border p-3 text-left ea-transition hover:border-primary/40 hover:bg-accent/30',
                          featured ? 'bg-background border-primary/20' : 'bg-card',
                        )}
                      >
                        <span className="text-2xl" aria-hidden>{p.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            {p.bestFor ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {p.bestFor}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{p.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
              <span className="text-2xl" aria-hidden>{picked.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{picked.name}</div>
                <div className="text-xs text-muted-foreground">{picked.description}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => reset()}>Change</Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="preset-role">
                {picked.template === '{role}' ? 'Board URL' : 'Role / keyword(s)'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="preset-role"
                value={role} onChange={(e) => setRole(e.target.value)}
                placeholder={picked.template === '{role}' ? 'https://…' : 'e.g. SEO, Performance Marketing, Paid Media'}
                autoFocus
              />
              {picked.template !== '{role}' ? (
                <div className="text-[11px] text-muted-foreground">
                  Separate multiple roles with commas. We&apos;ll create one job source per role, all sharing the location and keyword line.
                  {splitRoles(role).length > 1 ? (
                    <span className="ml-1 font-medium text-foreground">{splitRoles(role).length} sources will be added.</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {picked.needs.location ? (
              <div className="grid gap-1.5">
                <Label htmlFor="preset-loc">Location <span className="text-destructive">*</span></Label>
                <Input
                  id="preset-loc"
                  value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bangalore, Remote"
                />
              </div>
            ) : null}

            <div className={cn('rounded-md border bg-card p-3 text-xs', !role && 'opacity-50')}>
              <div className="font-medium text-muted-foreground">Preview {splitRoles(role).length > 1 ? `(first of ${splitRoles(role).length})` : ''}</div>
              <div className="mt-1 truncate font-mono text-foreground">
                {role ? buildPresetUrl(picked, splitRoles(role)[0] ?? role, location).url : 'Enter a role to preview the URL.'}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {picked ? (
            <Button onClick={submit} disabled={pending || !role.trim() || (picked.needs.location && !location.trim())}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Add source
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
