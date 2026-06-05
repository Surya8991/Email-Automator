'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveProfileAction } from '@/server/actions/profile'
import { RichTextEditor } from '@/components/rich-text-editor'

// Best-effort URL normalizer — prepends https:// if the user typed a bare
// domain. Rejects javascript:, data:, file:, etc. so a malicious value
// can never land as a clickable href elsewhere in the app (admin user
// drawer, future template rendering, etc.). Returns '' for unsafe input.
function normalizeUrl(v: string): string {
  const t = v.trim()
  if (!t) return ''
  // Explicit scheme: only allow http(s). Mailto/tel/etc. blocked here so
  // the simple "Portfolio / LinkedIn" inputs can't smuggle a payload.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return /^https?:\/\//i.test(t) ? t : ''
  }
  // No scheme — only prepend https:// if it actually looks like a domain.
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`
  // Anything else (free-form text) we leave as the user typed it.
  return t
}

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
  const [showPreview, setShowPreview] = useState(false)
  // Track the initial snapshot so we can detect unsaved edits. beforeunload
  // catches tab close / hard nav; in-app sidebar links would need a Next
  // router intercept which is involved — beforeunload alone covers the
  // most painful loss path (close tab, browser back).
  const initialSnapshot = useRef<string>('')
  const currentSnapshot = JSON.stringify(state)
  useEffect(() => {
    // Capture once on mount so resetting after save also clears the flag.
    if (!initialSnapshot.current) initialSnapshot.current = currentSnapshot
  }, [currentSnapshot])
  const dirty = initialSnapshot.current !== '' && initialSnapshot.current !== currentSnapshot
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom text; setting returnValue triggers
      // the native "Leave site?" dialog. This is the only path that
      // works across browsers today.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const set = (k: keyof typeof state) => (v: string) => setState((s) => ({ ...s, [k]: v }))

  // Cheap URL validation — flags obvious typos but doesn't reject;
  // form still submits and the server is the source of truth.
  const portfolioInvalid = useMemo(
    () => state.USER_PORTFOLIO_LINK.trim() !== '' && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(state.USER_PORTFOLIO_LINK.trim()),
    [state.USER_PORTFOLIO_LINK],
  )
  const linkedinInvalid = useMemo(
    () => state.PROFILE_LINKEDIN.trim() !== '' && !/linkedin\.com\//i.test(state.PROFILE_LINKEDIN.trim()),
    [state.PROFILE_LINKEDIN],
  )

  function submit() {
    // Normalize URLs at submit time so saved values are clean across the app.
    const normalized = {
      ...state,
      USER_PORTFOLIO_LINK: normalizeUrl(state.USER_PORTFOLIO_LINK),
      PROFILE_LINKEDIN: normalizeUrl(state.PROFILE_LINKEDIN),
    }
    setState(normalized)
    start(async () => {
      const r = await saveProfileAction(normalized)
      if ('error' in r && r.error) {
        toast.error(r.error)
      } else {
        toast.success('Profile saved')
        // Reset the dirty-state snapshot so beforeunload + indicator clear.
        initialSnapshot.current = JSON.stringify(normalized)
      }
    })
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      {/* ── Personal ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="email" label="Email" disabled value={email} onChange={() => {}} />
          <Field id="PROFILE_NAME" label="Name" value={state.PROFILE_NAME} onChange={set('PROFILE_NAME')} placeholder="Jane Doe" />
          <Field id="PROFILE_PHONE" label="Phone" value={state.PROFILE_PHONE} onChange={set('PROFILE_PHONE')} placeholder="+91 98765 43210" />
          <FieldWithExt
            id="PROFILE_LINKEDIN" label="LinkedIn"
            value={state.PROFILE_LINKEDIN}
            onChange={set('PROFILE_LINKEDIN')}
            placeholder="linkedin.com/in/janedoe"
            invalid={linkedinInvalid}
            invalidHint="Should include linkedin.com/"
            extHref={state.PROFILE_LINKEDIN && !linkedinInvalid ? normalizeUrl(state.PROFILE_LINKEDIN) : undefined}
          />
        </div>
      </section>

      {/* ── Outreach defaults ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Outreach defaults</h3>
        <p className="text-xs text-muted-foreground">
          Substituted into template variables. Empty values fall back to the literal placeholder text or whatever the template's <code>|fallback</code> says.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="PROFILE_COMPANY" label="Current company" value={state.PROFILE_COMPANY} onChange={set('PROFILE_COMPANY')} placeholder="Acme Corp" />
          <Field id="PROFILE_ROLE" label="Current role" value={state.PROFILE_ROLE} onChange={set('PROFILE_ROLE')} placeholder="Senior Growth Marketer" />
          <Field
            id="DEFAULT_ROLE_NAME"
            label="Default {{role_name}}"
            value={state.DEFAULT_ROLE_NAME}
            onChange={set('DEFAULT_ROLE_NAME')}
            placeholder="Growth Marketer"
            hint="Used when a contact has no Role / Title in your CSV."
          />
          <FieldWithExt
            id="USER_PORTFOLIO_LINK" label="Portfolio link"
            value={state.USER_PORTFOLIO_LINK}
            onChange={set('USER_PORTFOLIO_LINK')}
            placeholder="yourname.com"
            invalid={portfolioInvalid}
            invalidHint="Should look like a URL (https://… or domain.tld)"
            extHref={state.USER_PORTFOLIO_LINK && !portfolioInvalid ? normalizeUrl(state.USER_PORTFOLIO_LINK) : undefined}
          />
        </div>
      </section>

      {/* ── Signature ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Email signature</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {showPreview ? 'Hide preview' : 'Preview'}
          </Button>
        </div>
        <RichTextEditor
          value={state.CACHED_SIGNATURE}
          onChange={set('CACHED_SIGNATURE')}
          rows={6}
          placeholder="Best regards,&#10;Jane Doe · Growth Marketer · yourname.com"
        />
        {showPreview ? (
          <div className="rounded-md border bg-muted/20 p-4 text-sm">
            <div className="mb-2 text-xs uppercase text-muted-foreground">Preview — appended to outgoing emails</div>
            {/* SECURITY: render the signature HTML in a sandboxed iframe.
                sandbox="" with no allow-* tokens means: no script execution,
                no top-navigation, no form submission, no same-origin. So
                even a pasted <script> or <img onerror> can't run against
                the user's session. srcDoc avoids ever assigning unsafe
                strings to an attribute that resolves to a URL. */}
            <iframe
              title="Signature preview"
              sandbox=""
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:system-ui,sans-serif;color:#111;font-size:14px;line-height:1.5}@media (prefers-color-scheme:dark){body{color:#eee;background:transparent}}</style></head><body>${state.CACHED_SIGNATURE || '<em style="color:#888">Signature empty.</em>'}</body></html>`}
              className="h-40 w-full rounded border bg-background"
            />
          </div>
        ) : null}
      </section>

      {/* ── Unsubscribe footer ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Unsubscribe footer</h3>
        <p className="text-xs text-muted-foreground">
          Appended to every outgoing email when enabled. Each recipient gets a unique HMAC-signed unsubscribe link they can click without your involvement.
        </p>
        <Input
          id="UNSUBSCRIBE_TEXT" value={state.UNSUBSCRIBE_TEXT}
          onChange={(e) => set('UNSUBSCRIBE_TEXT')(e.target.value)}
          placeholder='If you no longer wish to receive these, click here to unsubscribe.'
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.UNSUBSCRIBE_ENABLED === 'true'}
            onChange={(e) => set('UNSUBSCRIBE_ENABLED')(e.target.checked ? 'true' : 'false')}
          />
          <span>Append unsubscribe footer to outgoing emails</span>
        </label>
      </section>

      <div className="flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending || !dirty}>
          <Save className="mr-1.5 h-4 w-4" /> {pending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        ) : null}
        {(portfolioInvalid || linkedinInvalid) ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">Some URLs look off — saving anyway.</span>
        ) : null}
      </div>
    </form>
  )
}

function Field({
  id, label, value, onChange, placeholder, disabled, hint,
}: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function FieldWithExt({
  id, label, value, onChange, placeholder, invalid, invalidHint, extHref,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; invalid?: boolean; invalidHint?: string; extHref?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={invalid ? 'border-amber-500 pr-9 focus-visible:ring-amber-500' : extHref ? 'pr-9' : ''}
        />
        {extHref ? (
          <a href={extHref} target="_blank" rel="noreferrer"
            className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Open link">
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      {invalid && invalidHint ? <p className="text-xs text-amber-600 dark:text-amber-400">{invalidHint}</p> : null}
    </div>
  )
}
