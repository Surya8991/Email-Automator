'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/contacts'

const NewContactSchema = z.object({
  recruiterEmail: z.string().email(),
  recruiterName: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  jobTitle: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  platform: z.string().max(60).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
})

export async function addContactAction(formData: FormData) {
  const u = await requireUser()
  const parsed = NewContactSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (await svc.emailExists(u.id, parsed.data.recruiterEmail)) return { error: 'This email already exists' }
  await svc.addContact(u.id, parsed.data)
  revalidatePath('/contacts')
  return { ok: true }
}

export async function deleteContactAction(id: number) {
  const u = await requireUser()
  await svc.deleteContact(u.id, id)
  revalidatePath('/contacts')
  return { ok: true }
}

export async function deleteContactsBulkAction(ids: number[]) {
  const u = await requireUser()
  await svc.deleteContactsBulk(u.id, ids)
  revalidatePath('/contacts')
  return { ok: true, deleted: ids.length }
}
