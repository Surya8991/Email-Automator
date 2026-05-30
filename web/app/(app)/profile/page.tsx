import { requireUser } from '@/auth'
import { getMany } from '@/server/services/settings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from './profile-form'

const KEYS = [
  'PROFILE_NAME', 'PROFILE_PHONE', 'PROFILE_COMPANY', 'PROFILE_ROLE',
  'PROFILE_LINKEDIN', 'USER_PORTFOLIO_LINK', 'DEFAULT_ROLE_NAME',
  'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED',
]

export default async function ProfilePage() {
  const u = await requireUser()
  const settings = await getMany(u.id, KEYS)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Card>
        <CardHeader><CardTitle>Identity & defaults</CardTitle></CardHeader>
        <CardContent>
          <ProfileForm email={u.email} initial={settings} />
        </CardContent>
      </Card>
    </div>
  )
}
