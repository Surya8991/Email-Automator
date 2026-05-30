import { requireUser } from '@/auth'
import { getMany } from '@/server/services/settings'
import { env } from '@/lib/env'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SettingsForm } from './settings-form'
import { DangerZone } from './danger-zone'
import { CheckCircle2, XCircle, Mail, Bot, Lock, Database, Sparkles } from 'lucide-react'

function Status({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail ?? (ok ? 'Configured' : 'Not configured')}</div>
      </div>
    </div>
  )
}

export default async function SettingsPage() {
  const u = await requireUser()
  const cur = await getMany(u.id, [
    'DAILY_SEND_LIMIT', 'TIMEZONE', 'DEFAULT_ROLE_NAME', 'USER_PORTFOLIO_LINK',
    'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED',
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{u.email}{u.isAdmin ? ' · admin' : ''}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="danger" className="text-destructive">Danger</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General</CardTitle><CardDescription>Defaults applied across drafts and campaigns.</CardDescription></CardHeader>
            <CardContent><SettingsForm initial={cur} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Outbound SMTP</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Status ok={Boolean(env.SMTP_USER && env.SMTP_PASS)} label="SMTP" detail={env.SMTP_USER ? `${env.SMTP_USER} via ${env.SMTP_HOST}:${env.SMTP_PORT}` : 'Set SMTP_USER and SMTP_PASS in .env'} />
              <p className="text-xs text-muted-foreground">
                Edit <code>.env</code> on the server to change credentials. For Gmail, generate an
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"> App Password</a>.
              </p>
              <a href="/diagnostic" className="text-xs underline">Run SMTP test → /diagnostic</a>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI provider</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Status ok={Boolean(env.GROQ_API_KEY)} label="Groq" detail={env.GROQ_API_KEY ? `Model ${env.GROQ_MODEL}` : 'Set GROQ_API_KEY in .env'} />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Powers the "AI improve" button in the template editor. Get a free key at
                <a className="underline" href="https://console.groq.com" target="_blank" rel="noreferrer"> console.groq.com</a>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Sign-in methods</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Status ok={Boolean(env.SMTP_USER && env.SMTP_PASS)} label="Magic link" detail="Uses your SMTP credentials." />
              <Status ok={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} label="Google OAuth" detail={env.GOOGLE_CLIENT_ID ? 'Configured' : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'} />
              <Status ok={process.env.ALLOW_DEV_SIGNIN === 'true'} label="Dev sign-in" detail={process.env.ALLOW_DEV_SIGNIN === 'true' ? 'On — disable before sharing this instance' : 'Off (recommended)'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Database</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">SQLite, WAL mode, foreign keys ON. File at <code>{env.DATABASE_URL}</code>.</p>
              <a className="text-xs underline" href="/api/backup" download>Download .db backup</a>
              <br />
              <a className="text-xs underline" href="/api/contacts/export" download>Export contacts as CSV</a>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <DangerZone />
        </TabsContent>
      </Tabs>
    </div>
  )
}
