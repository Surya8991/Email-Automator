'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addContactAction } from '@/server/actions/contacts'

export function AddContactDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add contact</Button>
      {open ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add contact</h2>
            <form className="space-y-3" action={(fd) => start(async () => {
              const r = await addContactAction(fd)
              if ('error' in r && r.error) { setError(r.error); return }
              setError(null); setOpen(false); router.refresh()
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
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
