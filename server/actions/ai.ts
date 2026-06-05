'use server'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { draftEmail, enrichCompany, suggestOpener, suggestSubjects, type Tone } from '@/server/services/ai'
import { rateLimit } from '@/lib/rate-limit'
import { actionError } from '@/lib/action-error'

const TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const

const DraftSchema = z.object({
  goal: z.string().min(1).max(1000),
  existing: z.string().max(20000).optional(),
  tone: z.enum(TONES).optional(),
})

export async function aiDraftAction(input: z.infer<typeof DraftSchema>) {
  const u = await requireUser()
  const parsed = DraftSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // 20 AI calls / minute / user — generous for clicking, harsh for abuse.
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) return { error: 'Too many AI requests — please wait a minute.' }
  try {
    const html = await draftEmail(u.id, {
      goal: parsed.data.goal,
      existing: parsed.data.existing,
      tone: (parsed.data.tone ?? 'professional') as Tone,
      vars: { name: '', company: '', role_name: '' },
    })
    return { ok: true, html }
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
}

const SubjectSchema = z.object({
  topic: z.string().min(1).max(300),
  count: z.number().int().min(1).max(8).optional(),
})

export async function aiSuggestSubjectsAction(input: z.infer<typeof SubjectSchema>) {
  const u = await requireUser()
  const parsed = SubjectSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) return { error: 'Too many AI requests — please wait a minute.' }
  try {
    const subjects = await suggestSubjects(u.id, parsed.data.topic, parsed.data.count ?? 5)
    return { ok: true as const, subjects }
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
}

const EnrichSchema = z.object({ name: z.string().min(1).max(200) })
export async function aiEnrichCompanyAction(input: z.infer<typeof EnrichSchema>) {
  const u = await requireUser()
  const parsed = EnrichSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) return { error: 'Too many AI requests — please wait a minute.' }
  try {
    const data = await enrichCompany(u.id, parsed.data.name)
    return { ok: true as const, data }
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
}

const OpenerSchema = z.object({
  contact: z.object({
    name: z.string().max(200).optional(),
    role: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  }),
  goal: z.string().min(1).max(500),
})
export async function aiSuggestOpenerAction(input: z.infer<typeof OpenerSchema>) {
  const u = await requireUser()
  const parsed = OpenerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) return { error: 'Too many AI requests — please wait a minute.' }
  try {
    const opener = await suggestOpener(u.id, parsed.data.contact, parsed.data.goal)
    return { ok: true as const, opener }
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
}
