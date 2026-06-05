'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// Auto-built breadcrumbs from the route segments. For detail pages
// like /contacts/[id] this renders `Contacts › 42`. Pretty enough
// out of the box; pages that want richer crumbs (e.g. company name
// instead of the id) can render their own and skip this.
//
// Skipped on top-level pages (only one segment) to keep the topbar
// clean — the sidebar already tells the user where they are.

const LABEL: Record<string, string> = {
  admin: 'Admin',
  analytics: 'Analytics',
  audit: 'Audit log',
  blocklist: 'Blocklist',
  campaigns: 'Campaigns',
  companies: 'Companies',
  contacts: 'Contacts',
  dashboard: 'Dashboard',
  diagnostic: 'Diagnostic',
  drafts: 'Drafts',
  'dry-run': 'Dry run',
  guide: 'Guide',
  profile: 'Profile',
  schedule: 'Schedule',
  settings: 'Settings',
  templates: 'Templates',
}

function prettify(seg: string): string {
  return LABEL[seg] ?? seg.replace(/-/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? ''
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const crumbs = parts.map((p, i) => {
    const href = '/' + parts.slice(0, i + 1).join('/')
    // Last segment is current page — not a link.
    const last = i === parts.length - 1
    // Numeric segment → assume an id, render as is.
    const isId = /^\d+$/.test(p)
    return { href, label: isId ? p : prettify(p), last }
  })

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center text-sm md:flex">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 ? <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden /> : null}
          {c.last ? (
            <span className="truncate font-medium text-foreground">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
