import { requireUser } from '@/auth'
import { getMany } from '@/server/services/settings'
import { db } from '@/server/db/client'
import { accounts } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { env } from '@/lib/env'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from './profile-form'
import { GmailCard } from './gmail-card'

const KEYS = [
  'PROFILE_NAME', 'PROFILE_PHONE', 'PROFILE_COMPANY', 'PROFILE_ROLE',
  'PROFILE_LINKEDIN', 'USER_PORTFOLIO_LINK', 'DEFAULT_ROLE_NAME',
  'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED',
]

export default async function ProfilePage() {
  const u = await requireUser()
  const settings = await getMany(u.id, KEYS)

  // Did this user sign in with Google? If so we can offer Gmail-API features.
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const hasGoogleAccount = googleConfigured && (await db.select().from(accounts)
    .where(and(eq(accounts.userId, u.id), eq(accounts.provider, 'google')))).length > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardHeader><CardTitle>Identity & defaults</CardTitle></CardHeader>
        <CardContent>
          <ProfileForm email={u.email} initial={settings} />
        </CardContent>
      </Card>

      {hasGoogleAccount ? (
        <Card>
          <CardHeader>
            <CardTitle>Gmail integration</CardTitle>
            <CardDescription className="text-xs">
              You're signed in with Google. Pull your real Gmail signature into your profile
              (one click, overwrites the signature field above).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GmailCard />
          </CardContent>
        </Card>
      ) : googleConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle>Gmail integration</CardTitle>
            <CardDescription className="text-xs">
              Sign out and sign back in with <strong>Continue with Google</strong> on the login page
              to unlock Gmail signature import, reply detection, and bounce check.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  )
}
