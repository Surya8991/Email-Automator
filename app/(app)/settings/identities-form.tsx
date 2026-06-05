'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Check, MailPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createIdentityAction, setDefaultIdentityAction, deleteIdentityAction } from '@/server/actions/identities'

interface Identity {
  id: number
  label: string
  fromName: string
  fromEmail: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  isDefault: boolean
}

const BLANK = {
  label: '', fromName: '', fromEmail: '',
  smtpHost: 'smtp.gmail.com', smtpPort: 587,
  smtpUser: '', smtpPass: '', isDefault: false,
}

export function IdentitiesForm({ rows }: { rows: Identity[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })
  const set = (k: keyof typeof BLANK) => (v: string | number | boolean) => setDraft((d) => ({ ...d, [k]: v }))

  function submit() {
    if (!draft.label.trim()) { toast.error('Label required'); return }
    if (!draft.fromEmail.trim()) { toast.error('From email required'); return }
    if (!draft.smtpUser.trim()) { toast.error('SMTP user required'); return }
    if (!draft.smtpPass.trim()) { toast.error('SMTP password required (will be encrypted at rest)'); return }
    start(async () => {
      const r = await createIdentityAction(draft)
      if ('error' in r) { toast.error(r.error ?? 'Failed'); return }
      toast.success(`Added "${draft.label}"`)
      setDraft({ ...BLANK })
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add additional from-addresses (Work / Personal / role-targeted persona). Each has its own SMTP credentials; passwords are AES-GCM encrypted at rest. One identity is the default — the worker picks it when no specific identity is requested per send.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center">
          <MailPlus className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No additional identities yet. The legacy single SMTP above is the implicit default.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{r.label}</span>
                  {r.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3 w-3" /> default
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.fromName ? `${r.fromName} ` : ''}&lt;{r.fromEmail}&gt;
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {r.smtpUser} · {r.smtpHost}:{r.smtpPort}
                </div>
              </div>
              <div className="flex gap-1">
                {!r.isDefault ? (
                  <Button variant="ghost" size="sm" disabled={pending}
                    onClick={() => start(async () => {
                      await setDefaultIdentityAction(r.id)
                      toast.success(`"${r.label}" is now default`)
                      router.refresh()
                    })}>
                    Make default
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" disabled={pending}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    if (!confirm(`Delete identity "${r.label}"? Sends that referenced its id will fall back to the legacy SMTP.`)) return
                    start(async () => {
                      await deleteIdentityAction(r.id)
                      toast.success('Deleted')
                      router.refresh()
                    })
                  }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3 rounded-md border bg-card p-4">
          <div className="text-sm font-semibold">New identity</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field id="i-label" label="Label *" value={draft.label} onChange={(v) => set('label')(v)} placeholder="Work / Personal / Outreach" />
            <Field id="i-fromName" label="From name" value={draft.fromName} onChange={(v) => set('fromName')(v)} placeholder="Jane Doe" />
            <Field id="i-fromEmail" label="From email *" value={draft.fromEmail} onChange={(v) => set('fromEmail')(v)} type="email" placeholder="jane@yourdomain.com" />
            <Field id="i-host" label="SMTP host" value={draft.smtpHost} onChange={(v) => set('smtpHost')(v)} />
            <Field id="i-user" label="SMTP user *" value={draft.smtpUser} onChange={(v) => set('smtpUser')(v)} placeholder="jane@yourdomain.com" />
            <Field id="i-pass" label="SMTP password *" value={draft.smtpPass} onChange={(v) => set('smtpPass')(v)} type="password" placeholder="••••••••" />
            <Field id="i-port" label="SMTP port" value={String(draft.smtpPort)} onChange={(v) => set('smtpPort')(Number(v) || 587)} type="number" />
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isDefault} onChange={(e) => set('isDefault')(e.target.checked)} />
                <span>Make default</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={submit}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Add identity'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending}
              onClick={() => { setAdding(false); setDraft({ ...BLANK }) }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add identity
        </Button>
      )}
    </div>
  )
}

function Field({
  id, label, value, onChange, placeholder, type = 'text',
}: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
