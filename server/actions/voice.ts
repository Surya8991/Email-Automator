'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'

// Persists brand-voice samples — a free-form blob injected into every
// AI generation prompt. Hard char cap mirrors what the AI service
// applies via .slice() so we never carry more than 2,400 chars through
// the system.

const VOICE_MAX = 2_400

const VoiceSchema = z.object({
  samples: z.string().max(VOICE_MAX),
})

export async function saveVoiceAction(input: z.infer<typeof VoiceSchema>) {
  const u = await requireUser()
  const parsed = VoiceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await setSetting(u.id, 'AI_VOICE_SAMPLES', parsed.data.samples)
  revalidatePath('/settings')
  return { ok: true as const }
}
