import { requireUser } from '@/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { env } from '@/lib/env'

export default async function SettingsPage() {
  const u = await requireUser()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <div><strong>Email:</strong> {u.email}</div>
          <div><strong>Admin:</strong> {u.isAdmin ? 'yes' : 'no'}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>System</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>Daily send limit: {env.DAILY_SEND_LIMIT}</div>
          <div>Timezone: {env.TIMEZONE}</div>
          <div>SMTP: {env.SMTP_USER ? 'configured' : 'not configured'}</div>
          <div>Google OAuth: {env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured'}</div>
          <div>Anthropic AI: {env.ANTHROPIC_API_KEY ? 'configured' : 'not configured'}</div>
        </CardContent>
      </Card>
    </div>
  )
}
