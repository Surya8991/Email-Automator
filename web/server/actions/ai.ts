'use server'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { draftEmail } from '@/server/services/ai'

const Schema = z.object({
  goal: z.string().min(1).max(1000),
  existing: z.string().max(20000).optional(),
})

export async function aiDraftAction(input: z.infer<typeof Schema>) {
  await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  try {
    const html = await draftEmail({
      goal: parsed.data.goal,
      existing: parsed.data.existing,
      vars: { name: '', company: '', role_name: '' },
    })
    return { ok: true, html }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'AI request failed' }
  }
}
