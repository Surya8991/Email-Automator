import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { env } from '@/lib/env'
import { DevSignInButton } from './dev-signin'
import { SubmitButton } from './submit-button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Workflow, BarChart3, Sparkles, Send, ShieldCheck, FileText, Clock,
} from 'lucide-react'

const FEATURES = [
  { icon: Send,        title: 'Bulk drafts + send',     blurb: 'Personalize with your variables, send in staggered batches.' },
  { icon: Clock,       title: 'Schedule + sequences',   blurb: 'Queue at any time. Multi-step campaigns with delays.' },
  { icon: BarChart3,   title: 'Tracking + analytics',   blurb: '1×1 pixel + link rewriting. See opens, clicks, replies.' },
  { icon: Sparkles,    title: 'AI assist (Groq)',       blurb: 'Llama 3.3 rewrites your draft in one click.' },
  { icon: FileText,    title: '20 ready templates',     blurb: 'Growth / Performance / SEO / Digital in 5 tones each.' },
  { icon: ShieldCheck, title: 'CSP, CSRF, multi-tenant', blurb: 'Hardened defaults. Per-user data isolation.' },
] as const

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  const googleOk = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const emailOk = Boolean(env.SMTP_USER && env.SMTP_PASS)
  const allowDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_SIGNIN === 'true'
  const devBypass = allowDev
    ? (process.env.DEV_BYPASS_EMAILS ?? 'test@gmail.com').split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      {/* Animated background blobs — pure CSS, no JS, no a11y impact. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4 z-10"><ThemeToggle /></div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hidden lg:flex flex-col justify-between p-12 border-r bg-card/30 backdrop-blur">
        <div>
          <div className="mb-12 flex items-center gap-2 text-xl font-semibold">
            <Workflow className="h-6 w-6 text-primary" />
            Email Automator
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Personalized outreach<br />at scale, on autopilot.
          </h1>
          <p className="mt-3 text-muted-foreground">
            One workspace for templates, contacts, campaigns, and analytics — without a $99/mo subscription.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
            {FEATURES.map(({ icon: Icon, title, blurb }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="text-xs text-muted-foreground">{blurb}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-muted-foreground">
          v2 · Next 15 · Drizzle · Auth.js · Groq · 100% self-hosted
        </div>
      </section>

      {/* ── Sign-in card ─────────────────────────────────────────────── */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Workflow className="h-5 w-5 text-primary" /> Email Automator
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace.</p>
          </div>

          {/* Google = primary action. One click, no inbox round-trip,
              also the only path that grants Gmail API scopes for the
              reply / bounce / signature features. */}
          {googleOk ? (
            <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/dashboard' }) }}>
              <SubmitButton
                variant="outline"
                className="h-11 w-full justify-center gap-3 border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                pendingChildren="Redirecting to Google…"
              >
                <GoogleIcon className="h-5 w-5" />
                <span className="text-[15px] font-medium">Continue with Google</span>
              </SubmitButton>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Fastest path. Also unlocks Gmail signature / reply / bounce detection.
              </p>
            </form>
          ) : null}

          {googleOk && emailOk ? <Divider label="or" /> : null}

          {emailOk ? (
            <form action={async (fd) => {
              'use server'
              try {
                await signIn('nodemailer', { email: String(fd.get('email') ?? ''), redirectTo: '/dashboard' })
              } catch (e) {
                if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
                throw e
              }
            }} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
              </div>
              <SubmitButton className="h-11 w-full" pendingChildren="Sending link…">
                Send magic link
              </SubmitButton>
              <p className="text-xs text-muted-foreground">We'll email you a one-click sign-in link.</p>
            </form>
          ) : (
            !googleOk ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                <strong>No sign-in providers configured.</strong> Set <code>GOOGLE_CLIENT_ID</code> / <code>SECRET</code> or <code>SMTP_USER</code> / <code>PASS</code> in <code>.env</code>.
              </div>
            ) : null
          )}

          {devBypass.length > 0 ? (
            <>
              <Divider label="dev only" />
              <div className="space-y-2">
                {devBypass.map((e) => (<DevSignInButton key={e} email={e} />))}
                <p className="text-[11px] text-muted-foreground">
                  Active because <code>ALLOW_DEV_SIGNIN=true</code>. Disable before sharing this instance.
                </p>
              </div>
            </>
          ) : null}

          <p className="pt-4 text-center text-xs text-muted-foreground">
            Outgoing emails get a 1×1 tracking pixel and rewritten links — for your own analytics.
            Per-user data is isolated.
          </p>
        </div>
      </section>
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative my-1 text-center text-xs uppercase tracking-wide text-muted-foreground">
      <span className="relative z-10 bg-background px-2">{label}</span>
      <div aria-hidden className="absolute inset-x-0 top-1/2 -z-0 h-px bg-border" />
    </div>
  )
}

// Official Google "G" logo per Google's branding guidelines. Four-color
// SVG, scales cleanly. Class is applied by caller for sizing.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className ?? 'mr-2 h-4 w-4'} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19.5-7.7 19.5-20 0-1.2-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.5 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5c-2 1.5-4.5 2.3-7.2 2.3-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.5 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5c4.3-3.9 6.7-9.6 6.7-16 0-1.2-.1-2.4-.4-3z"/>
    </svg>
  )
}
