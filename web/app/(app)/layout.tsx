import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { CommandPalette } from '@/components/command-palette'
import { ensureSeededTemplatesFor } from '@/server/services/onboarding'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin)
  const userId = (session.user as { id?: string }).id
  // First visit ever → seed the 20 starter templates so the user lands on
  // something useful instead of an empty editor. No-op on subsequent visits.
  if (userId) await ensureSeededTemplatesFor(userId).catch(() => { /* non-fatal */ })
  return (
    <div className="flex h-dvh">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userEmail={session.user.email ?? undefined} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
      <CommandPalette isAdmin={isAdmin} />
    </div>
  )
}
