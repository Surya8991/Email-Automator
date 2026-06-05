'use server'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { draftEmail, enrichCompany, suggestOpener, suggestSubjects, type Tone } from '@/server/services/ai'
import { generateFromContext, type GenerateKind, type OutputLength, type CtaEmphasis } from '@/server/services/ai-generate'
import { rateLimit } from '@/lib/rate-limit'
import { actionError } from '@/lib/action-error'

const TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const
const KINDS = ['jd', 'post', 'url', 'text'] as const satisfies readonly GenerateKind[]
const LENGTHS = ['short', 'medium', 'long'] as const satisfies readonly OutputLength[]
const CTAS = ['none', 'soft', 'direct'] as const satisfies readonly CtaEmphasis[]

const GenerateSchema = z.object({
  kind: z.enum(KINDS),
  // input is bigger for jd/post/text (raw user paste) than for url; we
  // cap at 50k either way to keep DB writes + Groq prompt bounded.
  input: z.string().min(1).max(50_000),
  recipient: z.object({
    name: z.string().max(200).optional(),
    role: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    notes: z.string().max(800).optional(),
  }).optional(),
  length: z.enum(LENGTHS).optional(),
  cta: z.enum(CTAS).optional(),
  goal: z.string().max(500).optional(),
})

/**
 * Generate a template-shaped draft from a JD / post / URL / free text.
 * Returns subject + body HTML + the AI's framing assumption so the
 * user can sanity-check the brief before accepting.
 *
 * Rate-limited 20/min/user via the shared `ai:` bucket — same as the
 * other AI actions. The URL fetcher has its own SSRF defenses inside
 * the service.
 */
export async function aiGenerateAction(input: z.infer<typeof GenerateSchema>) {
  const u = await requireUser()
  const parsed = GenerateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`ai:${u.id}`, 20, 60_000)) return { error: 'Too many AI requests — please wait a minute.' }
  try {
    const draft = await generateFromContext(u.id, parsed.data)
    return { ok: true as const, draft }
  } catch (e) {
    return actionError(e, 'AI generation failed')
  }
}

const DraftSchema = z.object({
  goal: z.string().min(1).max(1000),
  existing: z.string().max(20000).optional(),
  tone: z.enum(TONES).optional(),
  length: z.enum(LENGTHS).optional(),
  cta: z.enum(CTAS).optional(),
  recipient: z.object({
    name: z.string().max(200).optional(),
    role: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    notes: z.string().max(800).optional(),
  }).optional(),
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
      length: parsed.data.length,
      cta: parsed.data.cta,
      recipient: parsed.data.recipient,
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
