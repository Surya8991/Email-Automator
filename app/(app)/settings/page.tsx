import { requireUser } from '@/auth'
import { getMany } from '@/server/services/settings'
import { getAiFor, getSmtpFor } from '@/server/services/credentials'
import { listKeys } from '@/server/services/api-keys'
import { listWebhooks } from '@/server/services/webhooks'
import { listIdentities } from '@/server/services/identities'
import { env } from '@/lib/env'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SettingsForm } from './settings-form'
import { DangerZone } from './danger-zone'
import { SmtpForm } from './smtp-form'
import { IdentitiesForm } from './identities-form'
import { AiForm } from './ai-form'
import { ApiKeysForm } from './api-keys-form'
import { WebhooksForm } from './webhooks-form'
import { CheckCircle2, XCircle, Mail, Bot, Lock, Database, KeyRound, Webhook } from 'lucide-react'

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
  // Defensive wrapping — if any individual fetch fails (a missing prod
  // migration, a decryption error from a rotated ENCRYPTION_KEY, a
  // connection blip), the page still renders with sensible defaults
  // instead of returning a generic Vercel 500. The actual error is
  // logged via pino so it's visible in Vercel logs.
  const cur = await getMany(u.id, [
    'DAILY_SEND_LIMIT', 'TIMEZONE', 'DEFAULT_ROLE_NAME', 'USER_PORTFOLIO_LINK',
    'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED', 'SENDS_PAUSED',
    'PER_RECIPIENT_THROTTLE_DAYS', 'PER_DOMAIN_DAILY_CAP', 'CUSTOM_FIELD_KEYS',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
    'GROQ_API_KEY', 'GROQ_MODEL',
  ]).catch((e) => {
    console.error('[settings] getMany failed:', e)
    return {} as Record<string, string>
  })
  const [smtp, ai, apiKeyRows, webhookRows] = await Promise.all([
    getSmtpFor(u.id).catch((e) => {
      console.error('[settings] getSmtpFor failed:', e)
      return { host: '', port: 587, user: '', pass: '', from: '', source: 'none' as const }
    }),
    getAiFor(u.id).catch((e) => {
      console.error('[settings] getAiFor failed:', e)
      return { apiKey: '', model: '', source: 'none' as const }
    }),
    listKeys(u.id).catch((e) => {
      console.error('[settings] listKeys failed:', e)
      return [] as Awaited<ReturnType<typeof listKeys>>
    }),
    listWebhooks(u.id).catch((e) => {
      console.error('[settings] listWebhooks failed:', e)
      return [] as Awaited<ReturnType<typeof listWebhooks>>
    }),
  ])
  const identities = await listIdentities(u.id).catch((e) => {
    console.error('[settings] listIdentities failed:', e)
    return [] as Awaited<ReturnType<typeof listIdentities>>
  })

  // SECURITY: never send the encrypted secret strings to the client. Use
  // empty inputs paired with a "•••••• (saved)" placeholder when a value
  // exists. The forms already render the placeholder when initial value
  // is empty AND a `passSaved` / `keySaved` flag is true.
  const safeCur = { ...cur }
  const hadSmtpPass = Boolean(cur.SMTP_PASS)
  const hadGroqKey  = Boolean(cur.GROQ_API_KEY)
  if (hadSmtpPass) safeCur.SMTP_PASS = ''
  if (hadGroqKey)  safeCur.GROQ_API_KEY = ''

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{u.email}{u.isAdmin ? ' · admin' : ''}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="api">API keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="danger" className="text-destructive">Danger</TabsTrigger>
        </TabsList>

        {/* General — daily limit, timezone, signature, unsubscribe */}
        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General</CardTitle><CardDescription>Defaults applied across drafts and campaigns.</CardDescription></CardHeader>
            <CardContent><SettingsForm initial={safeCur} /></CardContent>
          </Card>
        </TabsContent>

        {/* Email — per-user SMTP creds with verify */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Default SMTP</CardTitle>
              <CardDescription>Used for magic-link login and every outgoing draft unless an identity is chosen below.</CardDescription>
            </CardHeader>
            <CardContent><SmtpForm initial={safeCur} source={smtp.source} passSaved={hadSmtpPass} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email identities</CardTitle>
              <CardDescription>Multiple from-addresses for Work / Personal / role-targeted personas.</CardDescription>
            </CardHeader>
            <CardContent><IdentitiesForm rows={identities} /></CardContent>
          </Card>
        </TabsContent>

        {/* AI — per-user Groq key */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> AI provider (Groq)</CardTitle>
              <CardDescription>Powers the "AI Improve" button in the template editor.</CardDescription>
            </CardHeader>
            <CardContent><AiForm initial={safeCur} source={ai.source} keySaved={hadGroqKey} /></CardContent>
          </Card>
        </TabsContent>

        {/* Auth — read-only status; Google OAuth requires env + server restart */}
        <TabsContent value="auth">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Sign-in methods</CardTitle>
              <CardDescription>Magic link uses your Email tab settings. Google OAuth + dev sign-in are configured in <code>.env</code> (server restart required).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Status ok={smtp.source !== 'none'} label="Magic link" detail={smtp.source !== 'none' ? `Uses ${smtp.user}` : 'Configure in Email tab'} />
              <Status ok={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} label="Google OAuth"
                detail={env.GOOGLE_CLIENT_ID ? 'Configured' : 'Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env'} />
              <Status ok={process.env.ALLOW_DEV_SIGNIN === 'true'} label="Dev sign-in (production)"
                detail={process.env.ALLOW_DEV_SIGNIN === 'true' ? 'ON — disable before sharing this instance' : 'Off (recommended for production)'} />
              <details className="rounded-md border p-3 text-xs">
                <summary className="cursor-pointer font-medium">How to add Google OAuth</summary>
                <ol className="mt-2 list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Open <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud → Credentials</a>.</li>
                  <li>Create OAuth Client ID → Web application.</li>
                  <li>Authorized redirect URI: <code>{env.APP_URL.replace(/\/$/, '')}/api/auth/callback/google</code></li>
                  <li>Paste Client ID + Secret into <code>.env</code> as <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>.</li>
                  <li>Restart the server. "Continue with Google" appears on /login.</li>
                </ol>
              </details>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API keys */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> API keys</CardTitle>
              <CardDescription>Bearer tokens for the <code>/api/v1/*</code> JSON API. Plaintext is shown once at creation.</CardDescription>
            </CardHeader>
            <CardContent><ApiKeysForm rows={apiKeyRows} /></CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhooks</CardTitle>
              <CardDescription>Outbound POSTs on every email event. Each delivery is HMAC-SHA256-signed.</CardDescription>
            </CardHeader>
            <CardContent><WebhooksForm rows={webhookRows} /></CardContent>
          </Card>
        </TabsContent>

        {/* Data */}
        <TabsContent value="data">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Data</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {/* Never leak the raw DATABASE_URL to the client — on Turso/libsql
                  deployments it includes the host you'd rather not advertise.
                  Show the driver shape only. */}
              <p className="text-muted-foreground">
                {env.DATABASE_URL.startsWith('libsql:') || env.DATABASE_URL.startsWith('https:')
                  ? 'Turso / libSQL (remote, hosted).'
                  : 'SQLite, WAL mode, foreign keys ON. Stored locally.'}
              </p>
              <a className="block text-xs underline" href="/api/contacts/export" download>Export contacts as CSV</a>
              {u.isAdmin ? <a className="block text-xs underline" href="/api/backup" download>Download full .db backup (admin)</a> : null}
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
