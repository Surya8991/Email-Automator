'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/api-keys'

const NameSchema = z.object({ name: z.string().min(1).max(80) })

export async function createKeyAction(input: z.infer<typeof NameSchema>) {
  const u = await requireUser()
  const parsed = NameSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const k = await svc.createKey(u.id, parsed.data.name)
  revalidatePath('/settings')
  // Caller shows `raw` once and then discards it.
  return { ok: true, raw: k.raw, id: k.id, prefix: k.prefix, name: k.name }
}

export async function revokeKeyAction(id: number) {
  const u = await requireUser()
  await svc.revokeKey(u.id, id)
  revalidatePath('/settings')
  return { ok: true }
}
