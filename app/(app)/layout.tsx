import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { CommandPalette } from '@/components/command-palette'
import { TimezoneProvider } from '@/components/timezone-provider'
import { ensureSeededTemplatesFor } from '@/server/services/onboarding'
import { getSetting } from '@/server/services/settings'
import { APP_TZ } from '@/lib/utils'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin)
  const userId = (session.user as { id?: string }).id
  // First visit ever → seed the 20 starter templates so the user lands on
  // something useful instead of an empty editor. No-op on subsequent visits.
  if (userId) await ensureSeededTemplatesFor(userId, session.user.email ?? '').catch(() => { /* non-fatal */ })
  // Pick up the user's chosen TZ; falls back to IST. Provided via context
  // so every client formatter (useFormatDate) in the tree is consistent.
  const userTz = userId ? (await getSetting(userId, 'TIMEZONE').catch(() => '')) || APP_TZ : APP_TZ
  return (
    <TimezoneProvider tz={userTz}>
      <div className="flex h-dvh">
        <Sidebar isAdmin={isAdmin} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar userEmail={session.user.email ?? undefined} isAdmin={isAdmin} />
          <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
        </div>
        <CommandPalette isAdmin={isAdmin} />
      </div>
    </TimezoneProvider>
  )
}
