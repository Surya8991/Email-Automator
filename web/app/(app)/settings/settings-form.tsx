'use client'
import { useState, useTransition } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveSettingsAction } from '@/server/actions/settings'

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [s, setS] = useState({
    DAILY_SEND_LIMIT: initial.DAILY_SEND_LIMIT ?? '50',
    TIMEZONE: initial.TIMEZONE ?? 'Asia/Kolkata',
    DEFAULT_ROLE_NAME: initial.DEFAULT_ROLE_NAME ?? '',
    USER_PORTFOLIO_LINK: initial.USER_PORTFOLIO_LINK ?? '',
    UNSUBSCRIBE_TEXT: initial.UNSUBSCRIBE_TEXT ?? '',
    UNSUBSCRIBE_ENABLED: initial.UNSUBSCRIBE_ENABLED ?? 'false',
  })
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof typeof s) => (v: string) => setS((x) => ({ ...x, [k]: v }))

  return (
    <form className="grid gap-4 md:grid-cols-2" action={() => start(async () => {
      const r = await saveSettingsAction(s)
      setMsg('error' in r && r.error ? r.error : 'Saved')
      setTimeout(() => setMsg(null), 2000)
    })}>
      <div className="grid gap-1.5">
        <Label htmlFor="DAILY_SEND_LIMIT">Daily send limit</Label>
        <Input id="DAILY_SEND_LIMIT" type="number" min={1} max={1000} value={s.DAILY_SEND_LIMIT} onChange={(e) => set('DAILY_SEND_LIMIT')(e.target.value)} />
        <p className="text-xs text-muted-foreground">Hard cap per day. Worker honors this per-user.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="TIMEZONE">Timezone</Label>
        <Input id="TIMEZONE" value={s.TIMEZONE} onChange={(e) => set('TIMEZONE')(e.target.value)} placeholder="Asia/Kolkata" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="DEFAULT_ROLE_NAME">Default role (for <code>{'{{role_name}}'}</code>)</Label>
        <Input id="DEFAULT_ROLE_NAME" value={s.DEFAULT_ROLE_NAME} onChange={(e) => set('DEFAULT_ROLE_NAME')(e.target.value)} placeholder="Growth Marketer" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="USER_PORTFOLIO_LINK">Portfolio link</Label>
        <Input id="USER_PORTFOLIO_LINK" value={s.USER_PORTFOLIO_LINK} onChange={(e) => set('USER_PORTFOLIO_LINK')(e.target.value)} placeholder="https://yourname.com" />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="UNSUBSCRIBE_TEXT">Unsubscribe footer text</Label>
        <Input id="UNSUBSCRIBE_TEXT" value={s.UNSUBSCRIBE_TEXT} onChange={(e) => set('UNSUBSCRIBE_TEXT')(e.target.value)} placeholder='Reply with "unsubscribe" to stop.' />
        <label className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={s.UNSUBSCRIBE_ENABLED === 'true'}
            onChange={(e) => set('UNSUBSCRIBE_ENABLED')(e.target.checked ? 'true' : 'false')} />
          Append unsubscribe footer to outgoing emails
        </label>
      </div>
      <div className="md:col-span-2 flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}><Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}</Button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </form>
  )
}
