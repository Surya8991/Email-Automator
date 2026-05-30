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

// Clone a template into a new row with " (copy)" suffix on label. Useful
// when you want to A/B-test a subject without losing the original — copy,
// tweak, activate the copy.
export async function cloneTemplateAction(id: number) {
  const u = await requireUser()
  const all = await svc.listTemplates(u.id)
  const src = all.find((t) => t.id === id)
  if (!src) return { error: 'Template not found' }
  // Find a unique key — append -copy, -copy-2, … until free.
  const existingKeys = new Set(all.map((t) => t.key))
  let suffix = 1, newKey = `${src.key}-copy`
  while (existingKeys.has(newKey)) { suffix++; newKey = `${src.key}-copy-${suffix}` }
  const created = await svc.upsertTemplate(u.id, newKey, {
    label: (src.label || src.key) + ' (copy)',
    category: src.category,
    subject: src.subject,
    initialMsg: src.initialMsg,
    follow1Msg: src.follow1Msg,
    lastFollowMsg: src.lastFollowMsg,
    active: false,
  })
  revalidatePath('/templates')
  return { ok: true, id: created.id, key: newKey }
}
