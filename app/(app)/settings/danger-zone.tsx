'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { dangerWipeAction } from '@/server/actions/settings'

type Scope = 'contacts' | 'drafts' | 'events' | 'all'
const OPTIONS: { value: Scope; label: string; warning: string }[] = [
  { value: 'contacts', label: 'All contacts',         warning: 'Removes every contact. Templates, drafts, and history stay.' },
  { value: 'drafts',   label: 'All drafts',           warning: 'Removes pending and sent drafts. Tracking events stay.' },
  { value: 'events',   label: 'All sends + events',   warning: 'Removes email_log + events. Drafts stay.' },
  { value: 'all',      label: 'Everything (your data)', warning: 'Wipes contacts, templates, drafts, campaigns, events, settings, blocklist. Your account stays.' },
]

export function DangerZone() {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>('contacts')
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const opt = OPTIONS.find((o) => o.value === scope)!

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" /> Danger zone
        </CardTitle>
        <CardDescription>Bulk-delete your data. There is no undo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={scope} onChange={(e) => { setScope(e.target.value as Scope); setText('') }}>
          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{opt.warning}</p>
        <div>
          <label className="text-xs text-muted-foreground">Type <code className="rounded bg-muted px-1">DELETE</code> to enable the button.</label>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
        </div>
        <Button variant="destructive" disabled={pending || text !== 'DELETE'}
          onClick={() => start(async () => {
            const r = await dangerWipeAction({ scope, confirm: 'DELETE' as const })
            if ('error' in r && r.error) { setMsg(r.error); return }
            setMsg('Done.'); setText(''); router.refresh()
          })}>
          {pending ? 'Wiping…' : `Wipe ${opt.label.toLowerCase()}`}
        </Button>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </CardContent>
    </Card>
  )
}
