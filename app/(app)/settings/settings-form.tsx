'use client'
import { useState, useTransition } from 'react'
import { Save, Pause, Play } from 'lucide-react'

// Parse the JSON-encoded CUSTOM_FIELD_KEYS setting back into a plain
// array for the comma-separated text field. Silently treats malformed
// JSON as empty so a broken setting doesn't lock the user out of editing.
function parseKeys(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveSettingsAction } from '@/server/actions/settings'

// Major business hubs + the IANA "Etc/UTC" anchor. The user is in India
// so IST leads, but a future operator in another region can pick theirs.
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata',       label: 'India (IST · UTC+5:30) — default' },
  { value: 'UTC',                label: 'UTC' },
  { value: 'America/New_York',   label: 'New York (ET)' },
  { value: 'America/Los_Angeles',label: 'Los Angeles (PT)' },
  { value: 'America/Chicago',    label: 'Chicago (CT)' },
  { value: 'Europe/London',      label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin',      label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Paris',       label: 'Paris (CET/CEST)' },
  { value: 'Asia/Dubai',         label: 'Dubai (GST · UTC+4)' },
  { value: 'Asia/Singapore',     label: 'Singapore (SGT · UTC+8)' },
  { value: 'Asia/Tokyo',         label: 'Tokyo (JST · UTC+9)' },
  { value: 'Asia/Shanghai',      label: 'Shanghai (CST · UTC+8)' },
  { value: 'Australia/Sydney',   label: 'Sydney (AEST/AEDT)' },
] as const

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [s, setS] = useState({
    DAILY_SEND_LIMIT: initial.DAILY_SEND_LIMIT ?? '50',
    TIMEZONE: initial.TIMEZONE ?? 'Asia/Kolkata',
    DEFAULT_ROLE_NAME: initial.DEFAULT_ROLE_NAME ?? '',
    USER_PORTFOLIO_LINK: initial.USER_PORTFOLIO_LINK ?? '',
    UNSUBSCRIBE_TEXT: initial.UNSUBSCRIBE_TEXT ?? '',
    UNSUBSCRIBE_ENABLED: initial.UNSUBSCRIBE_ENABLED ?? 'false',
    SENDS_PAUSED: initial.SENDS_PAUSED ?? 'false',
    PER_RECIPIENT_THROTTLE_DAYS: initial.PER_RECIPIENT_THROTTLE_DAYS ?? '0',
    PER_DOMAIN_DAILY_CAP: initial.PER_DOMAIN_DAILY_CAP ?? '',
    CUSTOM_FIELD_KEYS: initial.CUSTOM_FIELD_KEYS ?? '[]',
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
        <Label htmlFor="PER_RECIPIENT_THROTTLE_DAYS">Per-recipient throttle (days)</Label>
        <Input id="PER_RECIPIENT_THROTTLE_DAYS" type="number" min={0} max={365}
          value={s.PER_RECIPIENT_THROTTLE_DAYS}
          onChange={(e) => set('PER_RECIPIENT_THROTTLE_DAYS')(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Worker cancels any queued send to a recipient you already emailed within this window. <strong>0</strong> = disabled.
          Useful as a safety net against overlapping campaigns + follow-ups.
        </p>
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="CUSTOM_FIELD_KEYS">Custom contact fields</Label>
        <Input id="CUSTOM_FIELD_KEYS"
          value={parseKeys(s.CUSTOM_FIELD_KEYS).join(', ')}
          onChange={(e) => set('CUSTOM_FIELD_KEYS')(JSON.stringify(
            e.target.value.split(',').map((k) => k.trim().toLowerCase()).filter((k) => /^[a-z][a-z0-9_]*$/.test(k))
          ))}
          placeholder="region, tier, deal_stage" />
        <p className="text-xs text-muted-foreground">
          Comma-separated keys (lowercase, snake_case). Stored per-contact in <code>contacts.notes</code>
          (JSON-suffix; readable freeform notes still work). Insertable as <code>{'{{region}}'}</code> chips in
          the template editor and substituted at send time.
        </p>
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="PER_DOMAIN_DAILY_CAP">Per-domain daily cap</Label>
        <Input id="PER_DOMAIN_DAILY_CAP"
          value={s.PER_DOMAIN_DAILY_CAP}
          onChange={(e) => set('PER_DOMAIN_DAILY_CAP')(e.target.value)}
          placeholder="gmail.com=50, outlook.com=30, yahoo.com=20" />
        <p className="text-xs text-muted-foreground">
          Comma-separated <code>domain=N</code> pairs. When the day's count to any listed
          domain hits its cap, the worker <strong>defers</strong> (not cancels) further
          queued rows for that domain by 1 hour. Helps avoid being flagged as a bulk-sender by
          a single provider. Leave blank for no caps.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="TIMEZONE">Timezone</Label>
        <select
          id="TIMEZONE"
          value={s.TIMEZONE}
          onChange={(e) => set('TIMEZONE')(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* Curated list — covers India + the major business hubs.
              Free-text override is still possible by editing the DB. */}
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Used to render every date/time in the UI. New timestamps you create from now on are stored as IST.
        </p>
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
      {/* Emergency pause — instantly stops the worker from sending anything
          for you (schedules + campaigns just sit until you resume). Use it
          if you spot a problem mid-blast. */}
      <div className="md:col-span-2 rounded-md border p-3">
        <div className="flex items-start gap-3">
          {s.SENDS_PAUSED === 'true'
            ? <Pause className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            : <Play className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
          <div className="flex-1">
            <div className="font-medium">{s.SENDS_PAUSED === 'true' ? 'Sends paused' : 'Sends active'}</div>
            <p className="text-xs text-muted-foreground">
              Emergency kill-switch. When paused, the worker tick skips your scheduled emails
              and campaign steps. Already-queued rows stay; nothing is cancelled.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={s.SENDS_PAUSED === 'true'}
              onChange={(e) => set('SENDS_PAUSED')(e.target.checked ? 'true' : 'false')}
            />
            Pause
          </label>
        </div>
      </div>
      <div className="md:col-span-2 flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}><Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}</Button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </form>
  )
}
