// Campaign A/B testing — per-step template variants with hash-stable routing.
//
// When a step has variant rows, scheduler-tick calls pickVariantTemplateId()
// to deterministically map (stepId, contactId) → one variant's templateId.
// The same contact always hits the same variant on every replay (no double
// exposure). When no rows exist, scheduler falls back to step.templateId
// (back-compat — existing campaigns unchanged).
import { eq } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '@/server/db/client'
import { campaignStepVariants } from '@/server/db/schema'

export async function listVariants(stepId: number) {
  return db.select().from(campaignStepVariants)
    .where(eq(campaignStepVariants.stepId, stepId))
}

export async function addVariant(stepId: number, templateId: number, weight = 1, label = '') {
  const ins = await db.insert(campaignStepVariants).values({
    stepId, templateId, weight: Math.max(1, weight), label,
  }).returning({ id: campaignStepVariants.id })
  return ins[0]!.id
}

export async function removeVariant(id: number) {
  await db.delete(campaignStepVariants).where(eq(campaignStepVariants.id, id))
}

/**
 * Deterministic variant picker. Hashes (stepId, contactId) and modulos
 * across the weight sum. Returns the variant's templateId, or null if
 * the step has no variants (caller falls back to step.templateId).
 */
export async function pickVariantTemplateId(stepId: number, contactId: number): Promise<number | null> {
  const variants = await listVariants(stepId)
  if (variants.length === 0) return null
  const totalWeight = variants.reduce((s, v) => s + Math.max(1, v.weight), 0)
  if (totalWeight === 0) return null
  // SHA-256 first 4 bytes → uint32 → mod totalWeight. Stable across nodes,
  // language-agnostic if a future worker is rewritten.
  const hash = crypto.createHash('sha256').update(`${stepId}:${contactId}`).digest()
  const seed = hash.readUInt32BE(0) % totalWeight
  let cum = 0
  for (const v of variants) {
    cum += Math.max(1, v.weight)
    if (seed < cum) return v.templateId
  }
  // Shouldn't reach here, but fall back to last variant's template.
  return variants[variants.length - 1]!.templateId
}
