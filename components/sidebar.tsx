'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Users, FileText, Send, CalendarClock, BarChart3, Workflow,
  Settings, Shield, Ban, ScrollText, UserCircle2, FlaskConical, Eye, BookOpen,
  Building2, Menu, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/contacts',   label: 'Contacts',   icon: Users },
  { href: '/companies',  label: 'Companies',  icon: Building2 },
  { href: '/templates',  label: 'Templates',  icon: FileText },
  { href: '/drafts',     label: 'Drafts',     icon: Send },
  { href: '/dry-run',    label: 'Dry run',    icon: Eye },
  { href: '/schedule',   label: 'Schedule',   icon: CalendarClock },
  { href: '/campaigns',  label: 'Campaigns',  icon: Workflow },
  { href: '/analytics',  label: 'Analytics',  icon: BarChart3 },
  { href: '/blocklist',  label: 'Blocklist',  icon: Ban },
  { href: '/audit',      label: 'Audit log',  icon: ScrollText },
  { href: '/diagnostic', label: 'Diagnostic', icon: FlaskConical },
  { href: '/profile',    label: 'Profile',    icon: UserCircle2 },
  { href: '/settings',   label: 'Settings',   icon: Settings },
  { href: '/guide',      label: 'Guide',      icon: BookOpen },
] as const

export function Sidebar({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = isAdmin ? [...nav, { href: '/admin' as const, label: 'Admin' as const, icon: Shield }] : [...nav]

  const list = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(href + '/')
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={cn(
              'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Mobile burger lives in the topbar's slot via fixed positioning. */}
      <button
        aria-label="Open menu"
        className="fixed left-3 top-3 z-30 inline-flex items-center justify-center rounded-md border bg-card p-2 md:hidden"
        onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card/40">
        <div className="flex h-14 items-center border-b px-4 font-semibold tracking-tight">
          ✉️ Email Automator
        </div>
        {list}
        <div className="border-t p-3 text-xs text-muted-foreground">
          v2 · <kbd className="rounded border bg-background px-1">⌘K</kbd>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="relative z-50 flex h-full w-64 flex-col border-r bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b px-4 font-semibold tracking-tight">
              ✉️ Email Automator
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
