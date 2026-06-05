import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { CommandPalette } from '@/components/command-palette'
import { ShortcutsHelp } from '@/components/shortcuts-help'
import { AccentProvider } from '@/components/accent-provider'
import { InstallPrompt } from '@/components/install-prompt'
import { TimezoneProvider } from '@/components/timezone-provider'
import { ensureSeededTemplatesFor } from '@/server/services/onboarding'
import { getSetting } from '@/server/services/settings'
import { APP_TZ } from '@/lib/utils'
import { cookies } from 'next/headers'
import { verifyCookieValue } from '@/lib/cookies'
import { OnboardingModal, ONBOARDING_CURRENT_VERSION } from '@/components/onboarding-modal'
import { currentBroadcast } from '@/server/services/admin-analytics'
import { ImpersonationBanner } from '@/components/impersonation-banner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin)
  const userId = (session.user as { id?: string }).id
  // First visit ever → seed the 20 starter templates so the user lands on
  // something useful instead of an empty editor. No-op on subsequent visits.
  if (userId) await ensureSeededTemplatesFor(userId, session.user.email ?? '').catch(() => { /* non-fatal */ })
  // Pick up the user's chosen TZ; falls back to IST. Provided via context
  // so every client formatter (useFormatDate) in the tree is consistent.
  const userTz = userId ? (await getSetting(userId, 'TIMEZONE').catch(() => '')) || APP_TZ : APP_TZ
  // Per-user accent — picked in /profile. Empty = the default indigo theme.
  // Injected via a <style> tag overriding --primary; AccentProvider handles
  // the actual injection so SSR + CSR stay in sync.
  const userAccent = userId ? ((await getSetting(userId, 'ACCENT').catch(() => '')) || '') : ''
  // Onboarding gate. Show the modal until the user dismisses it at the
  // current version. Bump ONBOARDING_CURRENT_VERSION to re-show for
  // everyone after a major UX change.
  const seenRaw = userId ? await getSetting(userId, 'ONBOARDING_SEEN_VERSION').catch(() => '') : ''
  const seenVersion = Number(seenRaw || '0')
  const showOnboarding = Number.isFinite(seenVersion) && seenVersion < ONBOARDING_CURRENT_VERSION
  // Dev-signin in a deployed env is a footgun — banner so the operator can't
  // miss it. Local dev (NODE_ENV !== 'production' AND no VERCEL) stays quiet.
  const devSigninRisky =
    process.env.ALLOW_DEV_SIGNIN === 'true' &&
    (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL))
  // Latest broadcast announcement — shown as a banner to every signed-in
  // user until an admin clears it. Non-fatal if the DB read fails.
  const broadcast = await currentBroadcast().catch(() => null)
  // Impersonation indicator — visible on every page while an admin is
  // signed in as another user, so they can't forget they're in
  // impersonation mode and act under the wrong identity.
  const jar = await cookies()
  // Verify the HMAC signature before treating the cookie as real — a
  // DevTools-planted value will fail verifyCookieValue and not surface
  // the banner (matching what logAdmin does on the server side).
  const impersonating = Boolean(verifyCookieValue(jar.get('ea_impersonator')?.value))
  return (
    <TimezoneProvider tz={userTz}>
      <div className="flex h-dvh flex-col">
        {devSigninRisky && (
          <div className="border-b border-red-600 bg-red-600 px-4 py-1.5 text-center text-xs font-medium text-white">
            ⚠ ALLOW_DEV_SIGNIN=true on a deployed instance — anyone on DEV_BYPASS_EMAILS can sign in without auth. Unset before sharing.
          </div>
        )}
        {impersonating && <ImpersonationBanner targetEmail={session.user.email ?? ''} />}
        {broadcast?.message && (
          <div className="border-b border-amber-500/50 bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-200">
            📢 {broadcast.message}
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar isAdmin={isAdmin} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar userEmail={session.user.email ?? undefined} isAdmin={isAdmin} />
            <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
          </div>
          <CommandPalette isAdmin={isAdmin} />
          <ShortcutsHelp />
        </div>
      </div>
      {showOnboarding ? <OnboardingModal initialOpen={true} /> : null}
      <InstallPrompt />
      <AccentProvider accent={userAccent} />
    </TimezoneProvider>
  )
}
