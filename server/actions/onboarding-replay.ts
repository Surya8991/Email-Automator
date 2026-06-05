'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'

// Clears the per-user ONBOARDING_SEEN_VERSION so the app layout's
// onboarding gate re-shows the modal on the next render. Idempotent,
// no rate-limit needed (low-risk action).
export async function replayOnboardingAction() {
  const u = await requireUser()
  await setSetting(u.id, 'ONBOARDING_SEEN_VERSION', '0')
  // Refresh the layout so the gate re-evaluates and surfaces the modal.
  revalidatePath('/', 'layout')
  return { ok: true as const }
}
