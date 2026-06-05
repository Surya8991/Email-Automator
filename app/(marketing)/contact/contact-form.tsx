'use client'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mintFormTokenAction, submitContactAction } from '@/server/actions/contact'

const EMPTY = { name: '', email: '', subject: '', message: '', _hp: '', _t: '' }

interface FieldError { name?: string; email?: string; subject?: string; message?: string }

export function ContactForm() {
  const [state, setState] = useState(EMPTY)
  const [errors, setErrors] = useState<FieldError>({})
  const [submitted, setSubmitted] = useState(false)
  const [pending, start] = useTransition()

  // Mint a signed render-time token from the server when the form mounts.
  // Server verifies the token age on submit (must be >=2s and <30min)
  // to defeat headless bots that bypass the off-screen honeypot.
  useEffect(() => {
    let cancelled = false
    mintFormTokenAction().then((t) => { if (!cancelled) setState((s) => ({ ...s, _t: t })) })
    return () => { cancelled = true }
  }, [])
  const set = (k: keyof typeof EMPTY) => (v: string) => {
    setState((s) => ({ ...s, [k]: v }))
    if (errors[k as keyof FieldError]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  // Cheap client-side validation, mirrors the server Zod schema so the
  // user gets fast feedback. The server is still the source of truth.
  function validate(): boolean {
    const e: FieldError = {}
    if (!state.name.trim()) e.name = 'Name required'
    else if (state.name.length > 100) e.name = 'Name too long'
    if (!state.email.trim()) e.email = 'Email required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) e.email = 'Valid email required'
    if (!state.subject.trim()) e.subject = 'Subject required'
    else if (state.subject.length > 120) e.subject = 'Subject too long'
    if (!state.message.trim()) e.message = 'Message required'
    else if (state.message.length < 10) e.message = 'At least 10 characters'
    else if (state.message.length > 2000) e.message = 'Message too long (max 2000)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function submit() {
    if (!validate()) return
    start(async () => {
      const r = await submitContactAction(state)
      if ('error' in r && r.error) { toast.error(r.error); return }
      setSubmitted(true)
      setState(EMPTY)
      toast.success(('message' in r && r.message) || 'Thanks, we got it.')
    })
  }

  if (submitted) {
    return (
      <div className="ea-pop rounded-xl border bg-emerald-500/5 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 text-xl font-semibold">Message received.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll get back to you within 1–2 business days. Refresh to send another.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => { setSubmitted(false); setErrors({}) }}
        >
          Send another
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="space-y-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="contact-name"
          label="Your name"
          value={state.name}
          onChange={set('name')}
          placeholder="Jane Doe"
          autoComplete="name"
          required
          error={errors.name}
        />
        <Field
          id="contact-email"
          label="Email"
          value={state.email}
          onChange={set('email')}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          required
          error={errors.email}
        />
      </div>
      <Field
        id="contact-subject"
        label="Subject"
        value={state.subject}
        onChange={set('subject')}
        placeholder="What is this about?"
        required
        error={errors.subject}
      />

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="contact-message">Message</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{state.message.length} / 2000</span>
        </div>
        <textarea
          id="contact-message"
          value={state.message}
          onChange={(e) => set('message')(e.target.value)}
          rows={6}
          maxLength={2000}
          required
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? 'contact-message-err' : undefined}
          placeholder="Tell us what you need…"
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
            errors.message ? 'border-destructive' : ''
          }`}
        />
        {errors.message ? (
          <p id="contact-message-err" className="text-xs text-destructive">{errors.message}</p>
        ) : null}
      </div>

      {/* Honeypot, multiple layers so a11y tech / autofill / Puppeteer
          all skip it. display:none drops from layout AND tab order,
          aria-hidden hides from assistive tech, the input is also marked
          inert and lacks a visible label (uses aria-label only so it
          isn't announced via a co-located <label>). */}
      <div aria-hidden="true" style={{ display: 'none' }}>
        <input
          type="text"
          name="company_url"
          value={state._hp}
          onChange={(e) => set('_hp')(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-label="Leave this field blank"
          aria-hidden="true"
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          We don&apos;t share your email. Limited to 5 messages / hour / network.
        </p>
        <Button type="submit" disabled={pending}>
          <Send className="mr-1.5 h-4 w-4" /> {pending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  id, label, value, onChange, placeholder, type = 'text', autoComplete, required, error,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; autoComplete?: string; required?: boolean; error?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={error ? 'border-destructive' : ''}
      />
      {error ? <p id={`${id}-err`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
