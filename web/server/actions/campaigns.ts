'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/campaigns'

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

export async function enrollAction(input: z.infer<typeof EnrollSchema>) {
  const u = await requireUser()
  const parsed = EnrollSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  try {
    const r = await svc.enroll(u.id, parsed.data.campaignId, { tag: parsed.data.tag, contactIds: parsed.data.contactIds })
    revalidatePath(`/campaigns/${parsed.data.campaignId}`)
    return { ok: true, ...r }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Enroll failed' }
  }
}
