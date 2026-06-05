import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users, settings } from '@/server/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { AdminTable } from '../admin-table'
import { adminEmails } from '@/lib/env'
import { getUserSuspensions } from '@/server/actions/admin'
import { perUserStats } from '@/server/services/analytics'
import { and, eq, inArray } from 'drizzle-orm'

export default async function AdminUsersPage() {
  const me = await requireAdmin()
  const all = await db.select().from(users)
  const userIds = all.map((u) => u.id)
  const [suspensions, perUser, quotaRows] = await Promise.all([
    getUserSuspensions(userIds),
    perUserStats(),
    userIds.length > 0
      ? db.select({ uid: settings.userId, v: settings.value }).from(settings)
          .where(and(inArray(settings.userId, userIds), eq(settings.key, 'DAILY_SEND_LIMIT_OVERRIDE')))
      : Promise.resolve([] as { uid: string; v: string }[]),
  ])
  const quotaMap = new Map(quotaRows.map((r) => [r.uid, Number(r.v) || 0]))
  const rows = all.map((u) => {
    const s = perUser.get(u.id) ?? { contacts: 0, drafts: 0, events: 0 }
    return {
      id: u.id, email: u.email, name: u.name ?? '',
      createdAt: u.createdAt.toISOString(),
      isAdmin: adminEmails.includes((u.email ?? '').toLowerCase()),
      isMe: u.id === me.id,
      suspended: suspensions[u.id] ?? false,
      contacts: s.contacts, drafts: s.drafts, events: s.events,
      quotaOverride: quotaMap.get(u.id) ?? 0,
    }
  })

  return (
    <Card>
      <CardContent className="p-0">
        <AdminTable rows={rows} />
      </CardContent>
    </Card>
  )
}
