'use server'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdmin, requireUser } from '@/auth'
import * as svc from '@/server/services/campaigns'
import { actionError } from '@/lib/action-error'
import { db } from '@/server/db/client'
import { templates as templatesTable, auditLog } from '@/server/db/schema'
import { draftEmail, type Tone } from '@/server/services/ai'
import { rateLimit } from '@/lib/rate-limit'

const NameSchema = z.object({ name: z.string().min(1).max(120) })

export async function createCampaignAction(input: z.infer<typeof NameSchema>) {
  const u = await requireUser()
  const parsed = NameSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const c = await svc.createCampaign(u.id, parsed.data.name)
  revalidatePath('/campaigns')
  return { ok: true, id: c.id }
}

export async function setStatusAction(id: number, status: 'draft' | 'active' | 'paused' | 'archived') {
  const u = await requireUser()
  await svc.setStatus(u.id, id, status)
  revalidatePath('/campaigns')
  revalidatePath(`/campaigns/${id}`)
  return { ok: true }
}

export async function deleteCampaignAction(id: number) {
  const u = await requireUser()
  await svc.deleteCampaign(u.id, id)
  revalidatePath('/campaigns')
  return { ok: true }
}

const StepSchema = z.object({
  campaignId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  delayHours: z.number().int().min(0).max(720),
  stopOnReply: z.boolean(),
})

export async function addStepAction(input: z.infer<typeof StepSchema>) {
  const u = await requireUser()
  const parsed = StepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await svc.addStep(u.id, parsed.data.campaignId, parsed.data.templateId, parsed.data.delayHours, parsed.data.stopOnReply)
  revalidatePath(`/campaigns/${parsed.data.campaignId}`)
  return { ok: true }
}

export async function removeStepAction(campaignId: number, stepId: number) {
  const u = await requireUser()
  await svc.removeStep(u.id, campaignId, stepId)
  revalidatePath(`/campaigns/${campaignId}`)
  return { ok: true }
}

export async function moveStepAction(campaignId: number, stepId: number, direction: 'up' | 'down') {
  const u = await requireUser()
  await svc.moveStep(u.id, campaignId, stepId, direction)
  revalidatePath(`/campaigns/${campaignId}`)
  return { ok: true }
}

const EnrollSchema = z.object({
  campaignId: z.number().int().positive(),
  tag: z.string().max(60).optional(),
  contactIds: z.array(z.number().int().positive()).max(10000).optional(),
})

// Admin AI Improve for a campaign step's underlying template. Same Groq
// prompt as drafts/scheduled-emails; rewrites templates.initialMsg. Future
// sends for this step pick up the new body — past sends are unchanged.
const TONE_LIST = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const
export async function improveCampaignTemplateAction(templateId: number, tone: Tone = 'professional') {
  const me = await requireAdmin()
  if (!rateLimit(`admin-write:${me.id}:improve_campaign_tpl`, 60, 60_000)) {
    return { error: 'Too many admin actions — slow down' }
  }
  if (!TONE_LIST.includes(tone)) return { error: 'Invalid tone' }
  const [tpl] = await db.select().from(templatesTable)
    .where(and(eq(templatesTable.id, templateId), eq(templatesTable.userId, me.id)))
  if (!tpl) return { error: 'Template not found' }
  let improved: string
  try {
    improved = await draftEmail(me.id, {
      existing: tpl.initialMsg,
      tone,
      goal: 'Improve the email below — keep the intent and any {{variables}} intact, tighten language, fix awkward phrasing, match the requested tone.',
    })
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
  await db.update(templatesTable).set({ initialMsg: improved, version: tpl.version + 1, updatedAt: new Date() })
    .where(eq(templatesTable.id, tpl.id))
  try { await db.insert(auditLog).values({ userId: me.id, action: 'admin.ai_improve_campaign_template', detail: `template_id=${tpl.id} tone=${tone}`, ip: '' }) } catch { /* noop */ }
  revalidatePath('/templates')
  return { ok: true as const, initialMsg: improved }
}

export async function enrollAction(input: z.infer<typeof EnrollSchema>) {
  const u = await requireUser()
  const parsed = EnrollSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  try {
    const r = await svc.enroll(u.id, parsed.data.campaignId, { tag: parsed.data.tag, contactIds: parsed.data.contactIds })
    revalidatePath(`/campaigns/${parsed.data.campaignId}`)
    return { ok: true, ...r }
  } catch (e) {
    return actionError(e, 'Enroll failed')
  }
}
