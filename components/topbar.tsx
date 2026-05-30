import { ThemeToggle } from '@/components/theme-toggle'
import { signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function Topbar({ userEmail }: { userEmail?: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 pl-14 md:pl-4">
      <div className="text-sm text-muted-foreground truncate">{userEmail ?? ''}</div>
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
