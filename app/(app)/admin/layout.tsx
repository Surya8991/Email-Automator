import Link from 'next/link'
import { requireAdmin } from '@/auth'
import { AdminTabs } from './admin-tabs'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Instance-wide controls. Every action here is{' '}
            <Link href="/audit?scope=all" className="underline">audit-logged</Link>.
          </p>
        </div>
      </div>
      <AdminTabs />
      {children}
    </div>
  )
}
