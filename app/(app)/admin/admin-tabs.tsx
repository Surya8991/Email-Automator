'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Users, ListChecks, Webhook, Settings as SettingsIcon, Megaphone } from 'lucide-react'

const TABS = [
  { href: '/admin', label: 'Overview', icon: Activity },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/queue', label: 'Queue', icon: ListChecks },
  { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/admin/system', label: 'System', icon: SettingsIcon },
  { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
] as const

export function AdminTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href !== '/admin' && pathname.startsWith(t.href))
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
