'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'
import { verifySmtpFor } from '@/server/services/mailer'

const SmtpSchema = z.object({
  SMTP_HOST: z.string().min(1).max(120),
  SMTP_PORT: z.string().regex(/^\d+$/),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string().min(1).max(200),
  EMAIL_FROM: z.string().max(200).optional(),
})

export async function saveSmtpAction(input: z.infer<typeof SmtpSchema>) {
  const u = await requireUser()
  const parsed = SmtpSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) await setSetting(u.id, k, v)
  }
  // Verify right away — give the user instant feedback.
  const v = await verifySmtpFor(u.id)
  revalidatePath('/settings')
  if (!v.ok) return { ok: true, warning: `Saved, but SMTP verify failed: ${v.error}` }
  return { ok: true }
}

export async function clearSmtpAction() {
  const u = await requireUser()
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) {
    await setSetting(u.id, k, '')
  }
  revalidatePath('/settings')
  return { ok: true }
}

const AiSchema = z.object({
  GROQ_API_KEY: z.string().min(1).max(200),
  GROQ_MODEL: z.string().max(80).optional(),
})

export async function saveAiAction(input: z.infer<typeof AiSchema>) {
  const u = await requireUser()
  const parsed = AiSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await setSetting(u.id, 'GROQ_API_KEY', parsed.data.GROQ_API_KEY)
  if (parsed.data.GROQ_MODEL) await setSetting(u.id, 'GROQ_MODEL', parsed.data.GROQ_MODEL)
  revalidatePath('/settings')
  return { ok: true }
}

export async function clearAiAction() {
  const u = await requireUser()
  await setSetting(u.id, 'GROQ_API_KEY', '')
  await setSetting(u.id, 'GROQ_MODEL', '')
  revalidatePath('/settings')
  return { ok: true }
}
