import Link from 'next/link'
import { Mail, Github, BookOpen, MessageSquare } from 'lucide-react'
import { env } from '@/lib/env'
import { ContactForm } from './contact-form'

export const metadata = {
  title: 'Contact, Email Automator',
  description: "Get in touch. Bug reports, feature ideas, partnership questions, we'll get back within a day or two.",
}

export default function ContactPage() {
  // Extract a clean address from EMAIL_FROM. The env var can be either
  // `you@host.com` or `"Display Name <you@host.com>"`. Strip the display
  // part if present. Falls back to SMTP_USER, then null (no email card).
  function cleanFromEmail(): string | null {
    const raw = (env.EMAIL_FROM || env.SMTP_USER || '').trim()
    if (!raw) return null
    const bracketed = raw.match(/<([^>]+)>/)
    if (bracketed?.[1]) return bracketed[1]
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return raw
    return null
  }
  const contactEmail = cleanFromEmail()

  return (
    <>
      <header className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <div className="ea-fade-in space-y-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <MessageSquare className="h-3 w-3 text-primary" aria-hidden /> Contact
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Get in touch.
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            Bug reports, feature ideas, deployment questions, or partnership conversations. Pick the
            channel that fits.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Form */}
          <div className="ea-fade-in rounded-2xl border bg-card/40 p-6 backdrop-blur sm:p-8">
            <ContactForm />
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {contactEmail ? (
              <div className="ea-fade-in rounded-xl border bg-card/40 p-5 backdrop-blur" style={{ animationDelay: '60ms' }}>
                <Mail className="h-6 w-6 text-primary" aria-hidden />
                <h2 className="mt-3 text-base font-semibold">Direct email</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Prefer to write to a real inbox?
                </p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline ea-transition"
                >
                  {contactEmail}
                </a>
              </div>
            ) : null}

            <div className="ea-fade-in rounded-xl border bg-card/40 p-5 backdrop-blur" style={{ animationDelay: '120ms' }}>
              <Github className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="mt-3 text-base font-semibold">Open a GitHub issue</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Found a bug? Want to suggest a feature? File it on the repo so it stays public.
              </p>
              <a
                href="https://github.com/Surya8991/Email-Automator/issues/new"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline ea-transition"
              >
                File an issue →
              </a>
            </div>

            <div className="ea-fade-in rounded-xl border bg-card/40 p-5 backdrop-blur" style={{ animationDelay: '180ms' }}>
              <BookOpen className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="mt-3 text-base font-semibold">Quick question?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The guide covers most setup + deployment questions.
              </p>
              <Link
                href="/guide"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline ea-transition"
              >
                Read the guide →
              </Link>
            </div>

            <p className="text-xs text-muted-foreground">
              Response time: 1–2 business days. For deployment emergencies, GitHub Issues is fastest.
            </p>
          </aside>
        </div>
      </section>
    </>
  )
}
