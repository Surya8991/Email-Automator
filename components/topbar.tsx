import { ThemeToggle } from '@/components/theme-toggle'
import { signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import { LogOut, Shield } from 'lucide-react'

export function Topbar({ userEmail, isAdmin }: { userEmail?: string; isAdmin?: boolean }) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 pl-14 md:pl-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-muted-foreground truncate">{userEmail ?? ''}</span>
        {isAdmin ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
            title="Signed in with an ADMIN_EMAILS address"
          >
            <Shield className="h-3 w-3" /> Admin
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {userEmail ? (
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <Button variant="ghost" size="icon" aria-label="Sign out" type="submit"><LogOut className="h-4 w-4" /></Button>
          </form>
        ) : null}
      </div>
    </header>
  )
}
