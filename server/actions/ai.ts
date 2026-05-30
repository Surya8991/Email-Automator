'use server'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { draftEmail } from '@/server/services/ai'
import { rateLimit } from '@/lib/rate-limit'

const Schema = z.object({
  goal: z.string().min(1).max(1000),
  existing: z.string().max(20000).optional(),
})

export async function aiDraftAction(input: z.infer<typeof Schema>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // 20 AI calls / minute / user — generous for legit clicking, painful for
  // anyone trying to abuse the key.
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) {
    return { error: 'Too many AI requests — please wait a minute.' }
  }
  try {
    const html = await draftEmail(u.id, {
      goal: parsed.data.goal,
      existing: parsed.data.existing,
      vars: { name: '', company: '', role_name: '' },
    })
    return { ok: true, html }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'AI request failed' }
  }
}
