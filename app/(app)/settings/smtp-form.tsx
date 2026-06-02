'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Save, Trash2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearSmtpAction, saveSmtpAction } from '@/server/actions/credentials'
import { sendSmtpTestAction } from '@/server/actions/diagnostic'

interface Props {
  initial: { SMTP_HOST?: string; SMTP_PORT?: string; SMTP_USER?: string; SMTP_PASS?: string; EMAIL_FROM?: string }
  source: 'user' | 'env' | 'none'
  // True when an encrypted SMTP_PASS exists server-side. The page never
  // sends the actual ciphertext or plaintext to the client; this flag is
  // the only signal that "leave blank to keep current" is available.
  passSaved?: boolean
}

export function SmtpForm({ initial, source, passSaved = false }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [show, setShow] = useState(false)
  const [s, setS] = useState({
    SMTP_HOST: initial.SMTP_HOST ?? 'smtp.gmail.com',
    SMTP_PORT: initial.SMTP_PORT ?? '587',
    SMTP_USER: initial.SMTP_USER ?? '',
    SMTP_PASS: initial.SMTP_PASS ?? '',
    EMAIL_FROM: initial.EMAIL_FROM ?? '',
  })
  const set = (k: keyof typeof s) => (v: string) => setS((x) => ({ ...x, [k]: v }))

  return (
    <form className="grid gap-4 sm:grid-cols-2" action={() => start(async () => {
      // If the user left the password blank AND a saved one exists,
      // omit it from the payload so the server keeps the current value
      // instead of clobbering it with "".
      const payload = { ...s }
      if (passSaved && !s.SMTP_PASS) delete (payload as Partial<typeof s>).SMTP_PASS
      const r = await saveSmtpAction(payload as typeof s)
      if ('error' in r && r.error) { toast.error(r.error); return }
      if ('warning' in r && r.warning) toast.warning(r.warning)
      else toast.success('SMTP saved')
      router.refresh()
    })}>
      <div className="grid gap-1.5">
        <Label htmlFor="SMTP_HOST">Host</Label>
        <Input id="SMTP_HOST" value={s.SMTP_HOST} onChange={(e) => set('SMTP_HOST')(e.target.value)} placeholder="smtp.gmail.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="SMTP_PORT">Port</Label>
        <Input id="SMTP_PORT" type="number" inputMode="numeric" value={s.SMTP_PORT} onChange={(e) => set('SMTP_PORT')(e.target.value)} />
        <p className="text-xs text-muted-foreground">465 → secure mode on, 587 → STARTTLS</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="SMTP_USER">Email</Label>
        <Input id="SMTP_USER" type="email" autoComplete="email" value={s.SMTP_USER} onChange={(e) => set('SMTP_USER')(e.target.value)} placeholder="you@gmail.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="SMTP_PASS">Password / App Password</Label>
        <div className="relative">
          <Input id="SMTP_PASS" type={show ? 'text' : 'password'} autoComplete="off"
            value={s.SMTP_PASS} onChange={(e) => set('SMTP_PASS')(e.target.value)}
            placeholder={passSaved ? '••••••• (saved — leave blank to keep)' : 'Gmail App Password'} />
          <button type="button" onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" aria-label="Toggle password visibility">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          For Gmail: <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">create an App Password</a> (requires 2FA).
        </p>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="EMAIL_FROM">From header (optional)</Label>
        <Input id="EMAIL_FROM" value={s.EMAIL_FROM} onChange={(e) => set('EMAIL_FROM')(e.target.value)} placeholder='Your Name <you@gmail.com>' />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}><Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await sendSmtpTestAction()
          if ('error' in r) toast.error(r.error); else toast.success(`Test email sent to ${r.to}`)
        })}><Mail className="mr-1.5 h-4 w-4" /> Send test to me</Button>
        {source === 'user' ? (
          <Button type="button" variant="ghost" className="ml-auto text-destructive" disabled={pending}
            onClick={() => start(async () => {
              if (!confirm('Remove saved SMTP creds? The app falls back to environment variables (if any).')) return
              await clearSmtpAction()
              toast('SMTP creds cleared'); router.refresh()
            })}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        ) : null}
      </div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">
        Currently using: <code className="rounded bg-muted px-1.5 py-0.5">{source === 'user' ? 'your per-user settings' : source === 'env' ? '.env (process)' : 'nothing yet'}</code>
      </p>
    </form>
  )
}
