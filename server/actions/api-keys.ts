'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/api-keys'

const SCOPE_VALUES = ['read:contacts', 'write:contacts'] as const
const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(SCOPE_VALUES)).min(1).max(SCOPE_VALUES.length).optional(),
})

export async function createKeyAction(input: z.infer<typeof CreateSchema>) {
  const u = await requireUser()
  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // Default scopes: full contacts access. Matches the pre-0004 behavior so
  // existing UI flows that don't pick scopes get the same key power.
  const scopes = (parsed.data.scopes ?? ['read:contacts', 'write:contacts']).join(',')
  const k = await svc.createKey(u.id, parsed.data.name, scopes)
  revalidatePath('/settings')
  // Caller shows `raw` once and then discards it.
  return { ok: true, raw: k.raw, id: k.id, prefix: k.prefix, name: k.name, scopes: k.scopes }
}

export async function revokeKeyAction(id: number) {
  const u = await requireUser()
  await svc.revokeKey(u.id, id)
  revalidatePath('/settings')
  return { ok: true }
}
