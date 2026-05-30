import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { CommandPalette } from '@/components/command-palette'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin)
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
