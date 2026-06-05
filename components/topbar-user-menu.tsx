'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, Settings, UserCircle2, BookOpen, ChevronDown } from 'lucide-react'

// Topbar profile dropdown. Click the avatar circle (or the email on
// wider screens) to open. Click outside or press Escape to close.
// The sign-out form action is passed in so the parent (a server
// component) owns the `'use server'` boundary, not us.

function initialsFromEmail(email: string): string {
  // Strip + tags, then take the first letter + the first letter
  // after a `.` or `_`. Falls back to first 2 letters.
  const local = email.split('@')[0] ?? email
  const cleaned = local.split('+')[0] ?? local
  const parts = cleaned.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  return (cleaned.slice(0, 2) || 'U').toUpperCase()
}

export function TopbarUserMenu({
  email, signOutAction,
}: {
  email: string
  signOutAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = initialsFromEmail(email)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border bg-card/70 py-0.5 pl-0.5 pr-2 text-sm ea-transition hover:bg-card"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-[11px] font-semibold text-white shadow-sm">
          {initials}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu" aria-label="User menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border bg-card shadow-lg ea-pop"
        >
          <div className="border-b px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Signed in as</div>
            <div className="truncate text-sm font-medium">{email}</div>
          </div>
          <div className="py-1 text-sm">
            <MenuLink href="/profile" icon={UserCircle2} onClick={() => setOpen(false)}>Profile</MenuLink>
            <MenuLink href="/settings" icon={Settings} onClick={() => setOpen(false)}>Settings</MenuLink>
            <MenuLink href="/guide" icon={BookOpen} onClick={() => setOpen(false)}>User guide</MenuLink>
          </div>
          <form action={signOutAction} className="border-t">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function MenuLink({
  href, icon: Icon, onClick, children,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href} onClick={onClick} role="menuitem"
      className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  )
}
