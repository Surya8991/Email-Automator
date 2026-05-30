import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdminPage() {
  await requireAdmin()
  const all = await db.select().from(users)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Card>
        <CardHeader><CardTitle>{all.length} users</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Created</th></tr>
            </thead>
            <tbody>
              {all.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-3 py-2">{u.name ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(u.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
