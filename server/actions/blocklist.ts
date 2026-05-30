'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/blocklist'

const Schema = z.object({
  pattern: z.string().min(3).max(120),
  type: z.enum(['email', 'domain']),
})

export async function addBlocklistAction(input: z.infer<typeof Schema>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await svc.addEntry(u.id, parsed.data.pattern, parsed.data.type)
  revalidatePath('/blocklist')
  return { ok: true }
}

export async function removeBlocklistAction(id: number) {
  const u = await requireUser()
  await svc.removeEntry(u.id, id)
  revalidatePath('/blocklist')
  return { ok: true }
}
