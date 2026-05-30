'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'

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
