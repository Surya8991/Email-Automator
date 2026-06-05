'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { actionError } from '@/lib/action-error'
import * as svc from '@/server/services/identities'

const IdentitySchema = z.object({
  label: z.string().min(1).max(60),
  fromName: z.string().max(120).optional(),
  fromEmail: z.string().email(),
  smtpHost: z.string().min(1).max(120),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().min(1).max(200),
  smtpPass: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
})

export async function createIdentityAction(input: z.infer<typeof IdentitySchema>) {
  const u = await requireUser()
  const parsed = IdentitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  try {
    const id = await svc.createIdentity(u.id, {
      ...parsed.data,
      fromName: parsed.data.fromName ?? '',
      smtpPass: parsed.data.smtpPass ?? '',
    })
    revalidatePath('/settings')
    return { ok: true as const, id }
  } catch (e) {
    return actionError(e, 'Create failed')
  }
}

export async function setDefaultIdentityAction(id: number) {
  const u = await requireUser()
  await svc.setDefaultIdentity(u.id, id)
  revalidatePath('/settings')
  return { ok: true as const }
}

export async function deleteIdentityAction(id: number) {
  const u = await requireUser()
  await svc.deleteIdentity(u.id, id)
  revalidatePath('/settings')
  return { ok: true as const }
}
