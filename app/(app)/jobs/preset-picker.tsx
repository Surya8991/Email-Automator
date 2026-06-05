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
import { JOB_BOARD_PRESETS, buildPresetUrl, type JobBoardPreset } from '@/lib/job-board-presets'
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
    const { url, label, keywords } = buildPresetUrl(picked, role, location)
    if (!url || url.length < 8) { toast.error('URL is too short'); return }
    start(async () => {
      const r = await addJobSourceAction({ label, url, keywords })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Added "${label}" — refresh to pull the first leads`)
      setOpen(false); reset()
      router.refresh()
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
            Pick a job board, fill in the role + optional location, and we&apos;ll generate the URL. The SSRF-defended fetcher still validates whatever URL we end up with.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {JOB_BOARD_PRESETS.map((p) => (
              <button
                key={p.id} type="button"
                onClick={() => setPicked(p)}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40 hover:bg-accent/30 ea-transition"
              >
                <span className="text-2xl" aria-hidden>{p.icon}</span>
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{p.description}</div>
                </div>
              </button>
            ))}
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
                {picked.template === '{role}' ? 'Board URL' : 'Role / keyword'}
              </Label>
              <Input
                id="preset-role"
                value={role} onChange={(e) => setRole(e.target.value)}
                placeholder={picked.template === '{role}' ? 'https://…' : 'e.g. Product Manager'}
                autoFocus
              />
            </div>

            {picked.needs.location ? (
              <div className="grid gap-1.5">
                <Label htmlFor="preset-loc">Location</Label>
                <Input
                  id="preset-loc"
                  value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bangalore, Remote"
                />
              </div>
            ) : null}

            <div className={cn('rounded-md border bg-card p-3 text-xs', !role && 'opacity-50')}>
              <div className="font-medium text-muted-foreground">Preview</div>
              <div className="mt-1 truncate font-mono text-foreground">
                {role ? buildPresetUrl(picked, role, location).url : 'Enter a role to preview the URL…'}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {picked ? (
            <Button onClick={submit} disabled={pending || !role.trim()}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Add source
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
