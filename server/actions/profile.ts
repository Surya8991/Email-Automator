'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'
import { isValidAccent } from '@/components/accent-provider'

const KEYS = [
  'PROFILE_NAME', 'PROFILE_PHONE', 'PROFILE_COMPANY', 'PROFILE_ROLE',
  'PROFILE_LINKEDIN', 'USER_PORTFOLIO_LINK', 'DEFAULT_ROLE_NAME',
  'CACHED_SIGNATURE', 'UNSUBSCRIBE_TEXT', 'UNSUBSCRIBE_ENABLED',
] as const

const Schema = z.object(
  Object.fromEntries(KEYS.map((k) => [k, z.string().max(8000).optional()])) as Record<typeof KEYS[number], z.ZodOptional<z.ZodString>>
)

export async function saveProfileAction(input: Record<string, string | undefined>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) await setSetting(u.id, k, v)
  }
  revalidatePath('/settings')
  revalidatePath('/profile')
  return { ok: true }
}

/**
 * Persist the per-user accent color. Whitelist-checked against the
 * ACCENTS map — anything else (empty included) resets to the default
 * indigo. Tiny attack surface because the value is funneled into a
 * CSS custom property, but a malicious value could still inject extra
 * declarations if we trusted user input; isValidAccent() blocks that.
 */
export async function saveAccentAction(accent: string) {
  const u = await requireUser()
  if (accent && !isValidAccent(accent)) return { error: 'Invalid accent' }
  await setSetting(u.id, 'ACCENT', accent)
  revalidatePath('/profile')
  // Refresh every app page so the layout-level <style> tag updates.
  revalidatePath('/', 'layout')
  return { ok: true as const }
}
