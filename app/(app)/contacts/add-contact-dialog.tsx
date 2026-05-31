'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { addContactAction } from '@/server/actions/contacts'

export function AddContactDialog({ customFieldKeys = [] }: { customFieldKeys?: string[] }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErr(null) }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> Add contact</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
        <form className="space-y-3" action={(fd) => start(async () => {
          const r = await addContactAction(fd)
          if ('error' in r && r.error) { setErr(r.error); return }
          toast.success('Contact added')
          setErr(null); setOpen(false); router.refresh()
        })}>
          <div className="grid gap-1.5">
            <Label htmlFor="recruiterEmail">Email *</Label>
            <Input id="recruiterEmail" name="recruiterEmail" type="email" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="recruiterName">Name</Label>
              <Input id="recruiterName" name="recruiterName" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="jobTitle">Role</Label>
              <Input id="jobTitle" name="jobTitle" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="platform">Platform</Label>
              <Input id="platform" name="platform" placeholder="LinkedIn, Naukri…" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tags">Tags <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
            <Input id="tags" name="tags" placeholder="vc, priority-a, london" />
          </div>
          {customFieldKeys.length > 0 ? (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Custom fields
              </div>
              {/* Each key becomes a cf_<key> input. Server action picks
                  those out and writes them as a JSON suffix on notes. */}
              <div className="grid grid-cols-2 gap-3">
                {customFieldKeys.map((k) => (
                  <div key={k} className="grid gap-1">
                    <Label htmlFor={`cf_${k}`} className="text-xs">{k}</Label>
                    <Input id={`cf_${k}`} name={`cf_${k}`} placeholder={`{{${k}}}`} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Declared in Settings → Custom contact fields. Substituted as <code>{'{{key}}'}</code> in templates.
              </p>
            </div>
          ) : null}
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
