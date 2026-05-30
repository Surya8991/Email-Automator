'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/templates'

const TemplateSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  subject: z.string().max(300),
  initialMsg: z.string().max(20000),
  follow1Msg: z.string().max(20000).optional(),
  lastFollowMsg: z.string().max(20000).optional(),
})

export async function saveTemplateAction(input: z.infer<typeof TemplateSchema>) {
  const u = await requireUser()
  const parsed = TemplateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const t = await svc.upsertTemplate(u.id, parsed.data.key, parsed.data)
  revalidatePath('/templates')
  return { ok: true, id: t.id, version: t.version }
}

export async function activateTemplateAction(id: number) {
  const u = await requireUser()
  await svc.activate(u.id, id)
  revalidatePath('/templates')
  return { ok: true }
}
