'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileText, Send, CalendarClock, BarChart3, Workflow, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard',  label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contacts',   label: 'Contacts',  icon: Users },
  { href: '/templates',  label: 'Templates', icon: FileText },
  { href: '/drafts',     label: 'Drafts',    icon: Send },
  { href: '/schedule',   label: 'Schedule',  icon: CalendarClock },
  { href: '/campaigns',  label: 'Campaigns', icon: Workflow },
  { href: '/analytics',  label: 'Analytics', icon: BarChart3 },
  { href: '/settings',   label: 'Settings',  icon: Settings },
] as const

export function Sidebar({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const items = isAdmin ? [...nav, { href: '/admin', label: 'Admin', icon: Shield }] : nav

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card/40">
      <div className="flex h-14 items-center border-b px-4 font-semibold tracking-tight">
        ✉️ Email Automator
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link key={href} href={href}
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
      <div className="border-t p-3 text-xs text-muted-foreground">v2.0 · Next 15</div>
    </aside>
  )
}
