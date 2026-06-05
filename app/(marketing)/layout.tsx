import Link from 'next/link'
import { Workflow, Github, Zap } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata = {
  title: 'Email Automator — outreach at scale, on autopilot',
  description: 'Self-hosted email outreach. Templates, multi-step campaigns with A/B testing, AI-assisted writing, company research, multiple identities, audit log, JSON API.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const year = 2026 // Static rather than Date.now() so build output is deterministic.
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Skip-to-content for keyboard users — the focus ring shows only on
          keyboard nav so the visual chrome stays clean for mouse users. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Animated background blobs — pure CSS, respects prefers-reduced-motion via globals.css. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl ea-fade-in" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl ea-fade-in" style={{ animationDelay: '120ms' }} />
        <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl ea-fade-in" style={{ animationDelay: '240ms' }} />
      </div>

      {/* Sticky public nav */}
      <header className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4" aria-label="Primary">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Workflow className="h-5 w-5 text-primary" aria-hidden />
            Email Automator
          </Link>
          <div className="hidden items-center gap-1 sm:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/about">About</NavLink>
            <NavLink href="/contact">Contact</NavLink>
            <NavLink href="/guide">Guide</NavLink>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/Surya8991/Email-Automator"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
              className="hidden h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted ea-transition sm:inline-flex"
            >
              <Github className="h-4 w-4" />
            </a>
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted ea-transition"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 ea-transition"
            >
              Get started <Zap className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </nav>
        {/* Mobile sub-nav row — visible only on narrow viewports */}
        <div className="flex items-center justify-center gap-1 border-t bg-background/40 px-3 py-2 text-xs sm:hidden">
          <NavLink href="/" mobile>Home</NavLink>
          <NavLink href="/about" mobile>About</NavLink>
          <NavLink href="/contact" mobile>Contact</NavLink>
          <NavLink href="/guide" mobile>Guide</NavLink>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="mt-16 border-t bg-card/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <span>© {year} · MIT licensed · Self-hosted</span>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/guide" className="hover:text-foreground">Guide</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <a href="https://github.com/Surya8991/Email-Automator" target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function NavLink({ href, children, mobile = false }: { href: string; children: React.ReactNode; mobile?: boolean }) {
  return (
    <Link
      href={href}
      className={
        mobile
          ? 'rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground ea-transition'
          : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ea-transition'
      }
    >
      {children}
    </Link>
  )
}
