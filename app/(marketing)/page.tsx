import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  Send, Workflow, Sparkles, BarChart3, FileText, ShieldCheck, Building2,
  MailPlus, FlaskConical, Eye, Bot, Lock, ScrollText, Wand2, Zap, Github,
  Briefcase,
} from 'lucide-react'

const FEATURES = [
  { icon: Send,         title: 'Bulk drafts + send',     blurb: 'Personalize with your variables. Stagger sends in batches with per-domain caps.' },
  { icon: Workflow,     title: 'Multi-step campaigns',   blurb: 'Sequences with delays + stop-on-reply + per-step performance + A/B testing.' },
  { icon: Briefcase,    title: 'AI Job Tracker',         blurb: 'Adapter-first ingestion: Greenhouse, Lever, Ashby, Workable, Naukri, Remote OK + 10 more. Salary + remote normalization. Cross-board dedup. One-click outreach draft.' },
  { icon: BarChart3,    title: 'Tracking + analytics',   blurb: '1×1 pixel + link rewriting. Send-time heatmap, breakdowns by template / tag / platform.' },
  { icon: Sparkles,     title: 'AI assist (Groq)',       blurb: 'Llama 3.3 rewrites bodies, suggests subjects, enriches companies, generates openers.' },
  { icon: FileText,     title: 'Starter templates',      blurb: '5 public + 23 admin-overlay templates. Variables with fallbacks. Clickable insertion palette.' },
  { icon: Building2,    title: 'Company research',       blurb: 'Industry, HQ, size, tech stack, salary range. Auto-fills via AI; surfaces on contact detail.' },
  { icon: MailPlus,     title: 'Multiple identities',    blurb: 'Personal / Work / role personas, each with its own from-address + encrypted SMTP.' },
  { icon: ShieldCheck,  title: 'Hardened defaults',      blurb: 'CSP, HSTS, encrypted creds at rest, HMAC-signed admin cookies, multi-tenant isolation.' },
  { icon: Bot,          title: 'JSON API + webhooks',    blurb: 'Bearer auth with per-key scopes (read/write contacts). HMAC-signed outbound webhooks.' },
  { icon: Eye,          title: 'Dry-run preview',        blurb: 'See exactly what each contact would get before you send anything.' },
  { icon: Lock,         title: 'Admin dashboard',        blurb: '6 tabs: overview, users, queue, webhooks, system, broadcast. Impersonation. Audit log.' },
  { icon: ScrollText,   title: 'Audit log',              blurb: 'Every admin write logged. Per-user view + admin cross-user view with impersonation filter.' },
] as const

const STATS = [
  { v: '14', l: 'job-board adapters' },
  { v: '100%', l: 'self-hosted' },
  { v: '$0', l: '/mo to operate' },
  { v: '5 min', l: 'to first send' },
] as const

export default async function MarketingHomePage() {
  // Auth-aware root: signed-in visitors get bounced to the tool. Marketing
  // home only renders for unauthenticated visitors. auth() may throw on
  // some edge cases (cookie corruption); wrap defensively so a bad cookie
  // doesn't 500 the public landing page.
  try {
    const session = await auth()
    if (session?.user) redirect('/dashboard')
  } catch (e) {
    // redirect() throws by design, re-throw so Next handles it.
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
    console.error('[home] auth() failed (rendering marketing anyway):', e)
  }

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <header className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="ea-fade-in space-y-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="ea-pulse-ring inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Self-hosted · No subscription · Your data, your inbox
          </span>
          <h1 className="bg-gradient-to-br from-foreground via-primary to-emerald-500 bg-clip-text text-5xl font-bold leading-tight tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            Personalized outreach<br />at scale, on autopilot.
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            Templates with variables. Multi-step campaigns with A/B testing. AI-assisted writing.
            Open / click tracking. Company research. Multiple from-identities. One workspace, zero recurring fees.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 ea-transition">
              Get started <Zap className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <a href="https://github.com/Surya8991/Email-Automator" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-5 py-2.5 text-sm font-semibold hover:bg-muted ea-transition">
              <Github className="h-4 w-4" aria-hidden /> Star on GitHub
            </a>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.l} className="ea-pop rounded-lg border bg-card/40 p-4 text-center backdrop-blur ea-hover-lift"
              style={{ animationDelay: `${i * 70}ms` }}>
              <div className="text-2xl font-bold tabular-nums sm:text-3xl">{s.v}</div>
              <div className="text-xs text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ── Feature grid ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="features-heading">
        <div className="mb-10 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Features</div>
          <h2 id="features-heading" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need to run outreach</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">12 modules. One self-hosted workspace. No subscription, no data lock-in.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, blurb }, i) => (
            <article key={title}
              className="ea-fade-in ea-hover-lift ea-raised rounded-xl p-5 backdrop-blur"
              style={{ animationDelay: `${(i % 6) * 50}ms` }}>
              <span className="ea-icon-halo inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="how-heading">
        <div className="mb-10 text-center">
          <h2 id="how-heading" className="text-3xl font-bold tracking-tight">5 minutes to your first send</h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: 1, title: 'Set your profile', blurb: 'Name, role, portfolio link, signature. Drives every {{variable}}.' },
            { n: 2, title: 'Pick a template', blurb: '5 public + 23 admin starters. Activate one, AI-improve if needed.' },
            { n: 3, title: 'Import contacts', blurb: 'CSV / XLSX up to 100k rows. Dedupe + per-row error report.' },
            { n: 4, title: 'Schedule or campaign', blurb: 'One-off staggered blast or multi-step sequence with A/B variants.' },
          ].map((s, i) => (
            <li key={s.n}
              className="ea-fade-in relative rounded-xl border bg-card/40 p-5 backdrop-blur ea-hover-lift"
              style={{ animationDelay: `${i * 80}ms` }}>
              <div className="absolute -top-3 left-5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── AI block ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="ai-heading">
        <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-emerald-500/5 p-8 backdrop-blur ea-fade-in">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Wand2 className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <div className="flex-1">
              <h2 id="ai-heading" className="text-2xl font-bold tracking-tight">AI on every surface that matters</h2>
              <p className="mt-1 text-sm text-muted-foreground">All running on your own Groq API key (free tier covers a lot). Rate-limited 20/min/user.</p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <li className="flex items-start gap-2"><span className="mt-0.5 text-primary" aria-hidden>●</span><span><strong>AI Improve</strong> in drafts / schedule / campaigns, pick a tone, rewrite the body, 1-hour Undo.</span></li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-primary" aria-hidden>●</span><span><strong>AI subject suggester</strong> in templates, 5 variants from the body, click to swap.</span></li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-primary" aria-hidden>●</span><span><strong>AI company fill</strong> in /companies, auto-completes industry, HQ, tech stack, salary range.</span></li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-primary" aria-hidden>●</span><span><strong>AI opener</strong>, personalized first sentence per contact (server action ready).</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="ea-fade-in space-y-4">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Stop paying $99/mo for a CRM you don&apos;t use.</h2>
          <p className="text-base text-muted-foreground">One sign-in, one workspace, one inbox. Run it on your laptop or deploy to Vercel for free.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 ea-transition">
              Get started, it&apos;s free
            </Link>
            <Link href="/guide"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-6 py-3 text-sm font-semibold hover:bg-muted ea-transition">
              <FlaskConical className="h-4 w-4" aria-hidden /> Read the guide
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
