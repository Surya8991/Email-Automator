'use server'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'

/** Mark the onboarding modal as seen at version N. Idempotent. */
export async function markOnboardingSeenAction(version: number) {
  const u = await requireUser()
  if (!Number.isFinite(version) || version < 0) return { error: 'Invalid version' }
  await setSetting(u.id, 'ONBOARDING_SEEN_VERSION', String(Math.floor(version)))
  return { ok: true as const }
}
