import Link from 'next/link'
import { Github, Code2, Database, Lock, Zap, Sparkles, Boxes, Workflow } from 'lucide-react'

export const metadata = {
  title: 'About — Email Automator',
  description: 'A self-hosted outreach tool. Why we built it, who it is for, the tech behind it, and how it stays free.',
}

const STACK = [
  { icon: Code2,    title: 'Next.js 16',         blurb: 'App Router, server actions, Turbopack. React 19 underneath.' },
  { icon: Database, title: 'Drizzle ORM',        blurb: 'Type-safe SQL. Dual driver: better-sqlite3 locally, libSQL (Turso) on Vercel.' },
  { icon: Lock,     title: 'Auth.js v5',         blurb: 'Magic-link, Google OAuth, GitHub OAuth. Database sessions, HMAC-signed admin cookies.' },
  { icon: Sparkles, title: 'Groq (Llama 3.3)',   blurb: 'AI Improve, subject suggester, company enrichment, opener generator.' },
  { icon: Zap,      title: 'Vercel',             blurb: 'Zero-config deploys. Cron driven from GitHub Actions on the Hobby plan.' },
  { icon: Boxes,    title: 'Tailwind + shadcn',  blurb: 'Composable UI, dark/light mode, animations honor prefers-reduced-motion.' },
] as const

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <header className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <div className="ea-fade-in space-y-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Workflow className="h-3 w-3 text-primary" aria-hidden /> About
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Built so you don&apos;t have to pay <span className="text-muted-foreground line-through">$99/mo</span> for outreach.
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            A self-hosted alternative to Apollo, Outreach.io, Lemlist — without the subscription, without the
            data lock-in, and without the &ldquo;contact sales&rdquo; tier for the features you actually need.
          </p>
        </div>
      </header>

      {/* ── Story ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed sm:text-base">
        <div className="ea-fade-in space-y-5 text-muted-foreground">
          <p>
            Most outreach tools start free, then quietly move every useful feature behind a
            $99/mo or $300/mo plan: campaign sequences, A/B testing, multi-inbox, custom variables,
            integrations. Free trials end, your contacts get locked in, your data lives on
            someone else&apos;s server, and you start paying.
          </p>
          <p>
            <strong className="text-foreground">Email Automator</strong> takes the opposite stance: every feature is in the box, the
            data is in your SQLite or Turso database, and the only cost is whatever Vercel
            charges (Hobby is free) plus a Groq API key (free tier covers a lot of AI Improve calls).
          </p>
          <p>
            Built for solo founders, recruiters, growth marketers, and job seekers who run
            personalized outreach at meaningful scale and want a clean, hardened workspace
            without recurring fees.
          </p>
        </div>
      </section>

      {/* ── Stack ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby="stack-heading">
        <div className="mb-8 text-center">
          <h2 id="stack-heading" className="text-2xl font-bold tracking-tight">The stack</h2>
          <p className="mt-1 text-sm text-muted-foreground">All open source. All swappable.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map(({ icon: Icon, title, blurb }, i) => (
            <article
              key={title}
              className="ea-fade-in ea-hover-lift rounded-xl border bg-card/40 p-5 backdrop-blur"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <Icon className="h-7 w-7 text-primary" aria-hidden />
              <h3 className="mt-3 text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Philosophy ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-16" aria-labelledby="philosophy-heading">
        <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-emerald-500/5 p-8 backdrop-blur ea-fade-in">
          <h2 id="philosophy-heading" className="text-2xl font-bold tracking-tight">What it&apos;s not</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive" aria-hidden>✗</span>
              <span><strong className="text-foreground">Not a SaaS subscription.</strong> Run it locally with <code>npm run dev</code>, or deploy your own copy to Vercel.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive" aria-hidden>✗</span>
              <span><strong className="text-foreground">Not a cold-email blaster.</strong> Daily limit per user, per-domain caps, per-recipient throttle, soft-block flow.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-destructive" aria-hidden>✗</span>
              <span><strong className="text-foreground">Not a black box.</strong> Every send is audit-logged. Drizzle schema is in the repo. Your DB, your queries.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-500" aria-hidden>✓</span>
              <span><strong className="text-foreground">Free forever.</strong> MIT-licensed. Fork it. Modify it. Run it.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <div className="ea-fade-in space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Try it in 5 minutes.</h2>
          <p className="text-sm text-muted-foreground">
            No credit card, no &ldquo;Start free trial&rdquo;, no email upsells.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 ea-transition"
            >
              Get started
            </Link>
            <a
              href="https://github.com/Surya8991/Email-Automator"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-6 py-3 text-sm font-semibold hover:bg-muted ea-transition"
            >
              <Github className="h-4 w-4" aria-hidden /> Source code
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
