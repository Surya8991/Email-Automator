import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { env } from '@/lib/env'
import { DevSignInButton } from './dev-signin'
import { SubmitButton } from './submit-button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Sparkles, ShieldCheck, ChartNoAxesCombined,
} from 'lucide-react'

// Login page redesign (2026-06-06)
//
// Old: marketing-feel grid with a 6-feature wall on the left.
// New: clean auth card centered on the left, a muted brand panel on
// the right (≥lg) carrying a short three-point self-hosted pitch.
// Mobile collapses to card-only. Reuses every existing server action;
// design-only change.

const BRAND_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    blurb: 'No third-party SaaS. Per-user isolation, encryption at rest, MIT licensed.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Real outbound analytics',
    blurb: 'Opens, clicks, replies, bounces — first-party tracking, no spreadsheet exports.',
  },
  {
    icon: Sparkles,
    title: 'AI that knows your voice',
    blurb: 'Brand voice samples + recipient context + length/CTA controls. Groq under the hood.',
  },
] as const

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  const googleOk = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const githubOk = Boolean(env.GITHUB_ID && env.GITHUB_SECRET)
  const emailOk = Boolean(env.SMTP_USER && env.SMTP_PASS)
  const allowDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_SIGNIN === 'true'
  const devBypass = allowDev
    ? (process.env.DEV_BYPASS_EMAILS ?? 'test@gmail.com').split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1fr,1fr]">
      {/* Soft orbs behind the whole shell — same family as the in-app
          orbs, slightly more saturated since this is a hero surface. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-20 h-[36rem] w-[36rem] rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 h-[34rem] w-[34rem] rounded-full bg-emerald-500/20 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4 z-10"><ThemeToggle /></div>

      {/* ── Left: auth card ───────────────────────────────────────── */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="ea-floating w-full max-w-md rounded-2xl bg-card/80 p-8 backdrop-blur ea-fade-in">
          {/* Brand row — small mark + wordmark. Mobile keeps it visible
              since the right panel is hidden below lg. */}
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500 text-white shadow-sm">
              <EnvelopeIcon className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Email Automator</span>
          </div>

          <div className="mt-6">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace.</p>
          </div>

          {/* Primary CTA — Google, when configured. Single most-used path. */}
          {googleOk ? (
            <form
              className="mt-6"
              action={async () => { 'use server'; await signIn('google', { redirectTo: '/dashboard' }) }}
            >
              <SubmitButton
                variant="outline"
                className="h-11 w-full justify-center gap-3 border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                pendingChildren="Redirecting to Google…"
              >
                <GoogleIcon className="h-5 w-5" />
                <span className="text-[15px] font-medium">Continue with Google</span>
              </SubmitButton>
            </form>
          ) : null}

          {/* Secondary CTA — GitHub when configured. */}
          {githubOk ? (
            <form
              className="mt-3"
              action={async () => { 'use server'; await signIn('github', { redirectTo: '/dashboard' }) }}
            >
              <SubmitButton
                variant="outline"
                className="h-11 w-full justify-center gap-3 border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                pendingChildren="Redirecting to GitHub…"
              >
                <GitHubIcon className="h-5 w-5" />
                <span className="text-[15px] font-medium">Continue with GitHub</span>
              </SubmitButton>
            </form>
          ) : null}

          {(googleOk || githubOk) && emailOk ? <Divider label="or" /> : null}

          {/* Tertiary CTA — magic link. */}
          {emailOk ? (
            <form
              className="space-y-3"
              action={async (fd) => {
                'use server'
                try {
                  await signIn('nodemailer', {
                    email: String(fd.get('email') ?? ''),
                    redirectTo: '/dashboard',
                  })
                } catch (e) {
                  if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
                  throw e
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Email</Label>
                <Input
                  id="email" name="email" type="email"
                  placeholder="you@example.com"
                  required autoComplete="email"
                  className="h-11"
                />
              </div>
              <SubmitButton className="h-11 w-full" pendingChildren="Sending link…">
                Send magic link
              </SubmitButton>
              <p className="text-xs text-muted-foreground">
                We&apos;ll email you a one-click sign-in link.
              </p>
            </form>
          ) : !googleOk && !githubOk ? (
            <div className="mt-6 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <strong>No sign-in providers configured.</strong> Set <code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code>, or <code>SMTP_USER</code> + <code>SMTP_PASS</code> in <code>.env</code>.
            </div>
          ) : null}

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

          <p className="mt-8 border-t pt-4 text-center text-[11px] text-muted-foreground">
            Outgoing emails get a 1×1 tracking pixel and rewritten links — for your own analytics. Per-user data is isolated.
          </p>
        </div>
      </section>

      {/* ── Right: brand panel (lg+) ──────────────────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-l bg-card/40 p-12 backdrop-blur lg:flex">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Self-hosted outreach
          </div>
          <h2 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight">
            Outreach you own
            <br />
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              from inbox to insight.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            One workspace for templates, drafts, scheduled sends, multi-step campaigns, AI-assisted writing, and first-party analytics. No SaaS subscription. No data lock-in.
          </p>

          <ul className="mt-10 space-y-5">
            {BRAND_POINTS.map(({ icon: Icon, title, blurb }) => (
              <li key={title} className="flex gap-3">
                <span className="ea-icon-halo mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{blurb}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Next.js · Drizzle · Auth.js · Groq · MIT licensed
        </div>
      </section>
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative my-5 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      <span className="relative z-10 bg-card px-2">{label}</span>
      <div aria-hidden className="absolute inset-x-0 top-1/2 -z-0 h-px bg-border" />
    </div>
  )
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'h-5 w-5'} aria-hidden fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.17-3.1-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.57.23 2.73.11 3.02.73.81 1.17 1.84 1.17 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

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
