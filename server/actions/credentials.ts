'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'
import { verifySmtpFor, clearMailerCache } from '@/server/services/mailer'
import { encryptString } from '@/lib/crypto'

const SmtpSchema = z.object({
  SMTP_HOST: z.string().min(1).max(120),
  SMTP_PORT: z.string().regex(/^\d+$/),
  SMTP_USER: z.string().email(),
  // SMTP_PASS is optional on save — when omitted, the existing saved
  // (encrypted) value is kept. The form omits the field when the input
  // is blank and a saved password already exists.
  SMTP_PASS: z.string().min(1).max(200).optional(),
  EMAIL_FROM: z.string().max(200).optional(),
})

export async function saveSmtpAction(input: z.infer<typeof SmtpSchema>) {
  const u = await requireUser()
  const parsed = SmtpSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // Encrypt SMTP_PASS at rest. Other fields are not secrets (host/port/
  // user/from) so they go in as-is. See lib/crypto.ts for the format.
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue
    const value = k === 'SMTP_PASS' ? encryptString(v) : v
    await setSetting(u.id, k, value)
  }
  // Invalidate any cached Transporter so the next send picks up new creds.
  clearMailerCache()
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
  clearMailerCache()
  revalidatePath('/settings')
  return { ok: true }
}

const AiSchema = z.object({
  // Same omit-to-keep pattern as SMTP_PASS — see SmtpSchema comment.
  GROQ_API_KEY: z.string().min(1).max(200).optional(),
  GROQ_MODEL: z.string().max(80).optional(),
})

export async function saveAiAction(input: z.infer<typeof AiSchema>) {
  const u = await requireUser()
  const parsed = AiSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // Encrypt the API key at rest; the model is not a secret. Skip the
  // write when the field was omitted (UI sends nothing to mean "keep").
  if (parsed.data.GROQ_API_KEY) {
    await setSetting(u.id, 'GROQ_API_KEY', encryptString(parsed.data.GROQ_API_KEY))
  }
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
