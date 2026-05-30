'use client'
import { useState, useTransition } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveProfileAction } from '@/server/actions/profile'

export function ProfileForm({ email, initial }: { email: string; initial: Record<string, string> }) {
  const [state, setState] = useState({
    PROFILE_NAME: initial.PROFILE_NAME ?? '',
    PROFILE_PHONE: initial.PROFILE_PHONE ?? '',
    PROFILE_COMPANY: initial.PROFILE_COMPANY ?? '',
    PROFILE_ROLE: initial.PROFILE_ROLE ?? '',
    PROFILE_LINKEDIN: initial.PROFILE_LINKEDIN ?? '',
    USER_PORTFOLIO_LINK: initial.USER_PORTFOLIO_LINK ?? '',
    DEFAULT_ROLE_NAME: initial.DEFAULT_ROLE_NAME ?? '',
    CACHED_SIGNATURE: initial.CACHED_SIGNATURE ?? '',
    UNSUBSCRIBE_TEXT: initial.UNSUBSCRIBE_TEXT ?? '',
    UNSUBSCRIBE_ENABLED: initial.UNSUBSCRIBE_ENABLED ?? 'false',
  })
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const set = (k: keyof typeof state) => (v: string) => setState((s) => ({ ...s, [k]: v }))

  return (
    <form className="grid gap-4 md:grid-cols-2" action={() => start(async () => {
      const r = await saveProfileAction(state)
      setMsg('error' in r && r.error ? r.error : 'Saved')
      setTimeout(() => setMsg(null), 2000)
    })}>
      <div className="grid gap-1.5">
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="PROFILE_NAME">Name</Label>
        <Input id="PROFILE_NAME" value={state.PROFILE_NAME} onChange={(e) => set('PROFILE_NAME')(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="PROFILE_PHONE">Phone</Label>
        <Input id="PROFILE_PHONE" value={state.PROFILE_PHONE} onChange={(e) => set('PROFILE_PHONE')(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="PROFILE_COMPANY">Current company</Label>
        <Input id="PROFILE_COMPANY" value={state.PROFILE_COMPANY} onChange={(e) => set('PROFILE_COMPANY')(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="PROFILE_ROLE">Current role</Label>
        <Input id="PROFILE_ROLE" value={state.PROFILE_ROLE} onChange={(e) => set('PROFILE_ROLE')(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="PROFILE_LINKEDIN">LinkedIn</Label>
        <Input id="PROFILE_LINKEDIN" value={state.PROFILE_LINKEDIN} onChange={(e) => set('PROFILE_LINKEDIN')(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="USER_PORTFOLIO_LINK">Portfolio link</Label>
        <Input id="USER_PORTFOLIO_LINK" value={state.USER_PORTFOLIO_LINK} onChange={(e) => set('USER_PORTFOLIO_LINK')(e.target.value)} placeholder="https://…" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="DEFAULT_ROLE_NAME">Default role for {'{{role_name}}'}</Label>
        <Input id="DEFAULT_ROLE_NAME" value={state.DEFAULT_ROLE_NAME} onChange={(e) => set('DEFAULT_ROLE_NAME')(e.target.value)} placeholder="Growth Marketer" />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="CACHED_SIGNATURE">Email signature (HTML)</Label>
        <textarea id="CACHED_SIGNATURE" rows={6}
          className="rounded-md border bg-background px-3 py-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={state.CACHED_SIGNATURE} onChange={(e) => set('CACHED_SIGNATURE')(e.target.value)} />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="UNSUBSCRIBE_TEXT">Unsubscribe footer text</Label>
        <Input id="UNSUBSCRIBE_TEXT" value={state.UNSUBSCRIBE_TEXT} onChange={(e) => set('UNSUBSCRIBE_TEXT')(e.target.value)} placeholder='If you no longer wish to receive these, reply "unsubscribe".' />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={state.UNSUBSCRIBE_ENABLED === 'true'}
            onChange={(e) => set('UNSUBSCRIBE_ENABLED')(e.target.checked ? 'true' : 'false')} />
          Append unsubscribe footer to outgoing emails
        </label>
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}><Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}</Button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </form>
  )
}
