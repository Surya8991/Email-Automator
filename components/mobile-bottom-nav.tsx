'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Send, Workflow, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

// Mobile-only bottom nav bar. The burger drawer in <Sidebar> still
// works for the full nav list (especially admin links); this is the
// "thumb-zone" surface so the top 4 destinations + a "More" affordance
// are reachable without opening the drawer.
//
// Visibility: only renders below `md` so it doesn't conflict with the
// desktop sidebar. Safe-area padding for iOS notch / home indicator.

const ITEMS = [
  { href: '/dashboard',  label: 'Home',      icon: LayoutDashboard },
  { href: '/contacts',   label: 'Contacts',  icon: Users },
  { href: '/drafts',     label: 'Drafts',    icon: Send },
  { href: '/campaigns',  label: 'Campaigns', icon: Workflow },
] as const

export function MobileBottomNav() {
  const pathname = usePathname() ?? ''
  function active(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const a = active(href)
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-[10px]',
                  a ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5', a ? '' : 'opacity-80')} />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
        {/* The 5th cell triggers the burger drawer in <Sidebar> — we
            dispatch a synthetic click on the existing burger button so
            the drawer logic stays in one place. */}
        <li>
          <button
            type="button"
            onClick={() => {
              const btn = document.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement | null
              btn?.click()
            }}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Open more navigation"
          >
            <MoreHorizontal className="h-5 w-5 opacity-80" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
