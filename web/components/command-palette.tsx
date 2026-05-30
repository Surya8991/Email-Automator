'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { LayoutDashboard, Users, FileText, Send, CalendarClock, Workflow, BarChart3, Ban, ScrollText, UserCircle2, Settings, FlaskConical, Eye, BookOpen, Shield } from 'lucide-react'

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean }
const ITEMS: Item[] = [
  { href: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/contacts',   label: 'Contacts',    icon: Users },
  { href: '/templates',  label: 'Templates',   icon: FileText },
  { href: '/drafts',     label: 'Drafts',      icon: Send },
  { href: '/dry-run',    label: 'Dry run',     icon: Eye },
  { href: '/schedule',   label: 'Schedule',    icon: CalendarClock },
  { href: '/campaigns',  label: 'Campaigns',   icon: Workflow },
  { href: '/analytics',  label: 'Analytics',   icon: BarChart3 },
  { href: '/blocklist',  label: 'Blocklist',   icon: Ban },
  { href: '/audit',      label: 'Audit log',   icon: ScrollText },
  { href: '/profile',    label: 'Profile',     icon: UserCircle2 },
  { href: '/settings',   label: 'Settings',    icon: Settings },
  { href: '/diagnostic', label: 'Diagnostic',  icon: FlaskConical },
  { href: '/guide',      label: 'User guide',  icon: BookOpen },
  { href: '/admin',      label: 'Admin',       icon: Shield, admin: true },
]

export function CommandPalette({ isAdmin }: { isAdmin?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  const items = ITEMS.filter((it) => !it.admin || isAdmin)

  return (
    <div role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-start bg-black/50 p-4 pt-[15vh]"
      onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Command className="[&_[cmdk-list]]:max-h-80 [&_[cmdk-list]]:overflow-auto" loop>
          <div className="border-b">
            <Command.Input autoFocus placeholder="Jump to…" className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List>
            <Command.Empty className="px-4 py-6 text-sm text-muted-foreground">No matches.</Command.Empty>
            {items.map((it) => (
              <Command.Item key={it.href} value={it.label} onSelect={() => { setOpen(false); router.push(it.href) }}
                className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm aria-selected:bg-accent">
                <it.icon className="h-4 w-4 text-muted-foreground" />
                <span>{it.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{it.href}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <kbd className="rounded border bg-background px-1">↑↓</kbd> navigate ·{' '}
          <kbd className="rounded border bg-background px-1">↵</kbd> open ·{' '}
          <kbd className="rounded border bg-background px-1">esc</kbd> close
        </div>
      </div>
    </div>
  )
}
