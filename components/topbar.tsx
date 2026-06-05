import { signOut } from '@/auth'
import { ThemeToggle } from '@/components/theme-toggle'
import { TopbarSearch } from '@/components/topbar-search'
import { TopbarUserMenu } from '@/components/topbar-user-menu'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Shield } from 'lucide-react'

// Refreshed topbar (2026-06-05):
//   - Persistent search field that opens the ⌘K palette (palette was
//     previously discoverable only via the shortcut).
//   - Breadcrumbs slot for detail pages — the layout passes nothing
//     today, but route pages can render their own crumbs inside the
//     PageHeader. This component just stays out of the way.
//   - Profile dropdown with name + theme + sign-out.
//   - Admin badge stays.

export function Topbar({ userEmail, isAdmin }: { userEmail?: string; isAdmin?: boolean }) {
  // Hard-bind the sign-out action to /login so the topbar form has a
  // stable redirect even if next-auth's default redirect changes.
  const signOutAction = async () => { 'use server'; await signOut({ redirectTo: '/login' }) }

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b bg-background/70 px-4 pl-14 backdrop-blur md:pl-4">
      {/* Left: breadcrumbs (currently page-driven, empty here) + admin badge. */}
      <div className="flex min-w-0 items-center gap-2">
        <Breadcrumbs />
        {isAdmin ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
            title="Signed in with an ADMIN_EMAILS address"
          >
            <Shield className="h-3 w-3" /> Admin
          </span>
        ) : null}
      </div>

      {/* Right: search → theme → user menu. */}
      <div className="flex items-center gap-2">
        <TopbarSearch />
        <ThemeToggle />
        {userEmail ? (
          <TopbarUserMenu email={userEmail} signOutAction={signOutAction} />
        ) : null}
      </div>
    </header>
  )
}
