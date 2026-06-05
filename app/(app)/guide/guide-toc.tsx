'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search, ListTree, X, Sparkles, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TocItem { id: string; label: string }

// Client TOC sidebar. Three jobs:
//  1. Sticky on desktop so the table of contents is always visible while
//     reading a long section.
//  2. Highlight whichever section is currently in the viewport via
//     IntersectionObserver — saves the user from losing their place.
//  3. Client-side search that filters TOC entries by substring of
//     either id or label. Doesn't filter the page sections themselves
//     (would be jarring) — just the TOC list.
export function GuideToc({ items }: { items: ReadonlyArray<TocItem> }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? '')
  const [q, setQ] = useState('')

  // Scroll-spy. Pick the topmost section whose top has crossed the
  // header band (0..200px from the top). rootMargin shifts the
  // intersection window so the "active" state matches what the user
  // reads, not what's at exact y=0.
  useEffect(() => {
    const els = items.map((it) => document.getElementById(it.id)).filter((x): x is HTMLElement => x != null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    )
    for (const el of els) obs.observe(el)
    return () => obs.disconnect()
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((it) => it.label.toLowerCase().includes(needle) || it.id.toLowerCase().includes(needle))
  }, [items, q])

  return (
    <aside
      // sticky positioning keeps the TOC pinned ~80px below the top so
      // a sticky page header doesn't overlap it. On mobile the parent
      // grid collapses to one column, and TOC renders inline.
      className="space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" /> Contents
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search guide…"
          className="h-8 pl-7 pr-7 text-xs"
          aria-label="Filter table of contents"
        />
        {q ? (
          <button
            type="button" onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <nav className="space-y-0.5 text-sm">
        {filtered.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No matches.</p>
        ) : null}
        {filtered.map((it) => {
          const isActive = active === it.id
          return (
            <a
              key={it.id} href={`#${it.id}`}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1 text-xs ea-transition',
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <ChevronRight className={cn('h-3 w-3 shrink-0 opacity-0 ea-transition', isActive && 'opacity-100')} />
              <span className="truncate">{it.label}</span>
            </a>
          )
        })}
      </nav>
    </aside>
  )
}

// Inline "What's new" collapsible. Kept client-side so the open/close
// state survives navigation between sections without page reload.
// Single source of truth for the recent-additions list — mirrored in
// OPERATOR_TODO.html, kept in sync by hand.
export function WhatsNew() {
  const [open, setOpen] = useState(true)
  return (
    <section id="whats-new" className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-2 rounded-md border bg-primary/5 px-4 py-3 text-left ea-transition hover:bg-primary/10"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">What&apos;s new</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">2026-06-05</span>
        </span>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground ea-transition', open && 'rotate-90')} />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1.5 rounded-md border bg-card/40 px-4 py-3 text-sm">
          <li>
            🆕 <strong>Marketing site</strong> — public Home / About / Contact wrap the tool. Sign-in is now at <code className="rounded bg-muted px-1">/login</code>, marketing lives at <code className="rounded bg-muted px-1">/</code>.
          </li>
          <li>
            🆕 <strong>Smart draft creation</strong> — new dialog with template picker, count presets, platform / job-title / location filters, skip-recently-contacted toggle, and a live eligible counter that shows you who would be drafted before you click create.
          </li>
          <li>
            🆕 <strong>Schedule selected drafts</strong> — convert drafts straight into scheduled sends with a date + interval picker, without round-tripping through the contacts page.
          </li>
          <li>
            🆕 <strong>Templates polish</strong> — Test-send button (sends a personalized preview to your own address) and live variable validator that flags unknown <code className="rounded bg-muted px-1">{'{{tokens}}'}</code> before they ship literally to recipients.
          </li>
          <li>
            🆕 <strong>Diagnostic groups + Quick run</strong> — checks split into Connectivity / Background / Deliverability / Admin. Quick skips DNS lookups for post-deploy verification. Every warn now has an inline &ldquo;how to fix&rdquo; expand. Copy results as markdown for a postmortem.
          </li>
          <li>
            🆕 <strong>Identities</strong> — multiple From-addresses per user in Settings → Email.
          </li>
          <li>
            🆕 <strong>A/B variants</strong> — per-step variant CRUD on campaign detail with weighted hash routing.
          </li>
          <li>
            🆕 <strong>Companies</strong> — CRUD plus AI-fill from Groq (industry, HQ, size, tech stack, salary range from just a name). Contact detail page shows matched company sidebar.
          </li>
        </ul>
      ) : null}
    </section>
  )
}
