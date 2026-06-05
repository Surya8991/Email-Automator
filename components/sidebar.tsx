'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Users, FileText, Send, CalendarClock, BarChart3, Workflow,
  Settings, Shield, Ban, ScrollText, UserCircle2, FlaskConical, Eye, BookOpen,
  Building2, Menu, X, Mail, Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Sidebar nav grouped by purpose. Eyebrow labels above each group
// make the surface scannable at a glance — previously 14 links were
// dumped in a single column with no visual structure.
//
//   Workspace ── what data you have (Dashboard / Contacts / Companies)
//   Compose   ── what you're going to send (Templates / Drafts / Dry run)
//   Send      ── how you're sending it (Schedule / Campaigns)
//   Insights  ── how it went (Analytics / Blocklist / Audit log)
//   You       ── personal settings (Profile / Settings / Guide)
//   Admin     ── operator-only (Admin / Diagnostic) — hidden for non-admins
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
type NavGroup = { eyebrow: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    eyebrow: 'Workspace',
    items: [
      { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { href: '/contacts',   label: 'Contacts',   icon: Users },
      { href: '/companies',  label: 'Companies',  icon: Building2 },
      { href: '/jobs',       label: 'Job tracker', icon: Briefcase },
    ],
  },
  {
    eyebrow: 'Compose',
    items: [
      { href: '/templates',  label: 'Templates',  icon: FileText },
      { href: '/drafts',     label: 'Drafts',     icon: Send },
      { href: '/dry-run',    label: 'Dry run',    icon: Eye },
    ],
  },
  {
    eyebrow: 'Send',
    items: [
      { href: '/schedule',   label: 'Schedule',   icon: CalendarClock },
      { href: '/campaigns',  label: 'Campaigns',  icon: Workflow },
    ],
  },
  {
    eyebrow: 'Insights',
    items: [
      { href: '/analytics',  label: 'Analytics',  icon: BarChart3 },
      { href: '/blocklist',  label: 'Blocklist',  icon: Ban },
      { href: '/audit',      label: 'Audit log',  icon: ScrollText },
    ],
  },
  {
    eyebrow: 'You',
    items: [
      { href: '/profile',    label: 'Profile',    icon: UserCircle2 },
      { href: '/settings',   label: 'Settings',   icon: Settings },
      { href: '/guide',      label: 'Guide',      icon: BookOpen },
    ],
  },
]

const ADMIN_GROUP: NavGroup = {
  eyebrow: 'Admin',
  items: [
    { href: '/admin',      label: 'Admin',      icon: Shield },
    { href: '/diagnostic', label: 'Diagnostic', icon: FlaskConical },
  ],
}

export function Sidebar({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function renderLink({ href, label, icon: Icon }: NavItem) {
    const active = pathname === href || pathname?.startsWith(href + '/')
    return (
      <Link key={href} href={href} onClick={() => setOpen(false)}
        className={cn(
          'group relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] ea-transition',
          active
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}>
        {/* Active-row indicator — thin primary bar on the leading edge. */}
        {active ? (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
        ) : null}
        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
        <span className="truncate">{label}</span>
      </Link>
    )
  }

  function renderGroup(g: NavGroup, first = false) {
    return (
      <div key={g.eyebrow} className={cn('space-y-0.5', first ? '' : 'mt-3')}>
        <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          {g.eyebrow}
        </div>
        {g.items.map(renderLink)}
      </div>
    )
  }

  const list = (
    <nav className="flex-1 overflow-y-auto p-2">
      {GROUPS.map((g, i) => renderGroup(g, i === 0))}
      {isAdmin ? renderGroup(ADMIN_GROUP) : null}
    </nav>
  )

  const brand = (
    <div className="flex h-14 items-center gap-2 border-b px-4">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500 text-white shadow-sm">
        <Mail className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="font-semibold tracking-tight">Email Automator</span>
    </div>
  )

  return (
    <>
      {/* Mobile burger — fixed top-left so it's reachable from anywhere. */}
      <button
        aria-label="Open menu"
        className="fixed left-3 top-3 z-30 inline-flex items-center justify-center rounded-md border bg-card p-2 md:hidden"
        onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card/40 backdrop-blur-sm">
        {brand}
        {list}
        <div className="border-t p-3 text-[11px] text-muted-foreground/80">
          <span className="font-medium text-foreground/80">v2</span>{' '}· press{' '}
          <kbd className="rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>{' '}to jump
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="relative z-50 flex h-full w-64 flex-col border-r bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500 text-white shadow-sm">
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="font-semibold tracking-tight">Email Automator</span>
              </div>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            {list}
          </aside>
        </div>
      ) : null}
    </>
  )
}
