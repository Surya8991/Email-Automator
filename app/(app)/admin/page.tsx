import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminTable } from './admin-table'
import { AdminImportContactsCard } from './import-contacts-card'
import { adminEmails, env } from '@/lib/env'
import { getUserSuspensions } from '@/server/actions/admin'
import { systemStats, perUserStats } from '@/server/services/analytics'

export default async function AdminPage() {
  const me = await requireAdmin()
  // Pull users first; the other three queries can run in parallel after.
  // 4 round trips total replace the prior 1 + 3N loop.
  const all = await db.select().from(users)
  const [suspensions, stats, perUser] = await Promise.all([
    getUserSuspensions(all.map((u) => u.id)),
    systemStats(),
    perUserStats(),
  ])
  const rows = all.map((u) => {
    const s = perUser.get(u.id) ?? { contacts: 0, drafts: 0, events: 0 }
    return {
      id: u.id, email: u.email, name: u.name ?? '',
      createdAt: u.createdAt.toISOString(),
      isAdmin: adminEmails.includes((u.email ?? '').toLowerCase()),
      isMe: u.id === me.id,
      suspended: suspensions[u.id] ?? false,
      contacts: s.contacts, drafts: s.drafts, events: s.events,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">{all.length} user{all.length === 1 ? '' : 's'} on this instance.</p>
      </div>

      {/* Instance-wide totals — visible only to admins. */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-6">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Contacts" value={stats.contacts} />
        <StatCard label="Templates" value={stats.templates} />
        <StatCard label="Drafts pending" value={stats.draftsPending} />
        <StatCard label="Sent (30d)" value={stats.sent30d} />
        <StatCard label="Active campaigns" value={stats.activeCampaigns} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admins ({adminEmails.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {adminEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin emails configured. Set <code>ADMIN_EMAILS</code> in your environment to a
              comma-separated list (e.g. <code>you@example.com,cofounder@example.com</code>), then restart.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {adminEmails.map((e) => (
                  <li key={e} className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {e}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Configured via <code>ADMIN_EMAILS</code> (comma-separated). Restart required after changes.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Runtime configuration</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="DAILY_SEND_LIMIT" v={String(env.DAILY_SEND_LIMIT)} />
            <Row k="TIMEZONE" v={env.TIMEZONE} />
            <Row k="SMTP_HOST" v={env.SMTP_HOST} />
            <Row k="EMAIL_FROM" v={env.EMAIL_FROM || '—'} />
            <Row k="ALLOW_DEV_SIGNIN" v={String(process.env.ALLOW_DEV_SIGNIN === 'true')}
              tone={process.env.ALLOW_DEV_SIGNIN === 'true' ? 'warn' : undefined} />
            <Row k="CRON_SECRET" v={env.CRON_SECRET ? 'set' : 'unset'}
              tone={env.CRON_SECRET ? 'ok' : 'warn'} />
            <Row k="GROQ_API_KEY" v={env.GROQ_API_KEY ? 'set' : 'unset'}
              tone={env.GROQ_API_KEY ? 'ok' : 'muted'} />
            <Row k="GOOGLE_CLIENT_ID" v={env.GOOGLE_CLIENT_ID ? 'set' : 'unset'}
              tone={env.GOOGLE_CLIENT_ID ? 'ok' : 'muted'} />
            <Row k="DATABASE_URL" v={env.DATABASE_URL.startsWith('libsql:') ? 'libsql (turso)' : 'sqlite file'} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Set in environment; restart required after changes. Secrets are never shown — only set/unset state.
          </p>
        </CardContent>
      </Card>

      <AdminImportContactsCard />

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent className="p-0">
          <AdminTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  )
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const toneClass =
    tone === 'warn' ? 'text-red-600 dark:text-red-400'
    : tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'muted' ? 'text-muted-foreground'
    : ''
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
      <dd className={`font-mono text-xs ${toneClass}`}>{v}</dd>
    </div>
  )
}
