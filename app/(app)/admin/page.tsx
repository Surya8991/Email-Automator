import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users, contacts, drafts, events } from '@/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminTable } from './admin-table'
import { adminEmails } from '@/lib/env'

async function userStats(uid: string) {
  const cRows = await db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, uid))
  const dRows = await db.select({ n: sql<number>`COUNT(*)` }).from(drafts).where(eq(drafts.userId, uid))
  const sRows = await db.select({ n: sql<number>`COUNT(*)` }).from(events).where(eq(events.userId, uid))
  return {
    contacts: Number(cRows[0]?.n ?? 0),
    drafts: Number(dRows[0]?.n ?? 0),
    events: Number(sRows[0]?.n ?? 0),
  }
}

export default async function AdminPage() {
  const me = await requireAdmin()
  const all = await db.select().from(users)
  const rows = await Promise.all(all.map(async (u) => ({
    id: u.id, email: u.email, name: u.name ?? '',
    createdAt: u.createdAt.toISOString(),
    isAdmin: adminEmails.includes((u.email ?? '').toLowerCase()),
    isMe: u.id === me.id,
    ...(await userStats(u.id)),
  })))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">{all.length} user{all.length === 1 ? '' : 's'} on this instance.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent className="p-0">
          <AdminTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  )
}
