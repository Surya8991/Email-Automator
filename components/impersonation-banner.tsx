'use client'
import { useTransition } from 'react'
import { UserCog, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { exitImpersonationAction } from '@/server/actions/admin'

/**
 * Sticky banner shown across every (app) page when the current session
 * carries an ea_impersonator cookie. Reminds the admin they're acting as
 * the target user and gives a one-click way out.
 */
export function ImpersonationBanner({ targetEmail }: { targetEmail: string }) {
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center justify-between gap-2 border-b border-purple-600 bg-purple-600 px-4 py-1.5 text-xs font-medium text-white">
      <span className="inline-flex items-center gap-1.5">
        <UserCog className="h-3.5 w-3.5" />
        Impersonating <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono">{targetEmail}</span>
        — every action below is audit-logged with your admin id.
      </span>
      <Button size="sm" variant="ghost"
        className="h-6 px-2 text-white hover:bg-white/15 hover:text-white"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await exitImpersonationAction()
          if ('redirect' in r && r.redirect) window.location.href = r.redirect
        })}>
        <LogOut className="mr-1 h-3 w-3" /> Exit
      </Button>
    </div>
  )
}
