'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCampaignAction } from '@/server/actions/campaigns'

export function NewCampaignButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <>
      <Button onClick={() => { setOpen(true); setErr(null) }}><Plus className="mr-1.5 h-4 w-4" /> New campaign</Button>
      {open ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">New campaign</h2>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Founder Outreach" />
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={pending || !name} onClick={() => start(async () => {
                  const r = await createCampaignAction({ name })
                  if ('error' in r && r.error) { setErr(r.error); return }
                  if ('ok' in r && r.ok) { setOpen(false); router.push(`/campaigns/${r.id}`) }
                })}>
                  {pending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
