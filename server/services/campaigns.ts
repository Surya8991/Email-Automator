import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  campaigns, campaignSteps, campaignEnrollments,
  contacts, events, type Campaign, type Contact,
} from '@/server/db/schema'
import { userOwnsTemplate } from './templates'

// ─── Campaign CRUD ────────────────────────────────────────────────────
export async function listCampaigns(userId: string): Promise<Array<Campaign & { stepCount: number; enrolled: number }>> {
  const cs = await db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.id))
  if (cs.length === 0) return []
  const ids = cs.map((c) => c.id)
  const steps = await db.select({ campaignId: campaignSteps.campaignId, n: sql<number>`COUNT(*)` })
    .from(campaignSteps).where(inArray(campaignSteps.campaignId, ids)).groupBy(campaignSteps.campaignId)
  const enr = await db.select({ campaignId: campaignEnrollments.campaignId, n: sql<number>`COUNT(*)` })
    .from(campaignEnrollments).where(inArray(campaignEnrollments.campaignId, ids)).groupBy(campaignEnrollments.campaignId)
  const stepMap = new Map(steps.map((s) => [s.campaignId, Number(s.n)]))
  const enrMap = new Map(enr.map((e) => [e.campaignId, Number(e.n)]))
  return cs.map((c) => ({ ...c, stepCount: stepMap.get(c.id) ?? 0, enrolled: enrMap.get(c.id) ?? 0 }))
}

export async function createCampaign(userId: string, name: string): Promise<Campaign> {
  const ins = await db.insert(campaigns).values({ userId, name, status: 'draft' }).returning()
  return ins[0]!
}

export async function getCampaign(userId: string, id: number) {
  const [row] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
  if (!row) return null
  const steps = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, id)).orderBy(asc(campaignSteps.order))
  const enrollments = await db.select().from(campaignEnrollments).where(eq(campaignEnrollments.campaignId, id)).orderBy(asc(campaignEnrollments.id))
  return { campaign: row, steps, enrollments }
}

export async function setStatus(userId: string, id: number, status: 'draft' | 'active' | 'paused' | 'archived') {
  await db.update(campaigns).set({ status }).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
}

export async function deleteCampaign(userId: string, id: number) {
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
}

// ─── Step-level performance ───────────────────────────────────────────
export interface StepStats {
  stepOrder: number; templateId: number | null
  sent: number; opened: number; clicked: number; replied: number; advanced: number
}

/**
 * For each step in a campaign, count the events we recorded against its
 * template + sent in the relevant time window. We don't store step_id on
 * events directly, so we approximate by (campaign_id in meta, step_index)
 * which scheduler-tick already writes. "advanced" = number of enrollments
 * that progressed past this step.
 */
export async function getStepStats(userId: string, campaignId: number): Promise<StepStats[]> {
  const steps = await db.select().from(campaignSteps)
    .where(eq(campaignSteps.campaignId, campaignId)).orderBy(asc(campaignSteps.order))
  if (steps.length === 0) return []

  // Pull every event for this user where meta references this campaign.
  // The set is bounded by activity on this single campaign, so loading +
  // grouping in JS is cheaper than a SQL JSON-path query the dual-driver
  // would have trouble with.
  const evRows = await db.select().from(events)
    .where(and(eq(events.userId, userId), sql`${events.meta} LIKE ${'%"campaignId":' + campaignId + '%'}`))

  const counts = new Map<number, { sent: number; opened: number; clicked: number; replied: number }>()
  for (const s of steps) counts.set(s.order, { sent: 0, opened: 0, clicked: 0, replied: 0 })

  for (const e of evRows) {
    let meta: { step?: number; campaignId?: number } = {}
    try { meta = JSON.parse(e.meta || '{}') } catch { continue }
    const step = typeof meta.step === 'number' ? meta.step : null
    if (step === null) continue
    const b = counts.get(step); if (!b) continue
    if (e.kind === 'sent') b.sent++
    else if (e.kind === 'open') b.opened++
    else if (e.kind === 'click') b.clicked++
    else if (e.kind === 'reply') b.replied++
  }

  // Advanced = enrollments whose currentStep > this step's order (or completed).
  const enrolledRows = await db.select({ currentStep: campaignEnrollments.currentStep, status: campaignEnrollments.status })
    .from(campaignEnrollments).where(eq(campaignEnrollments.campaignId, campaignId))

  return steps.map((s) => {
    const c = counts.get(s.order)!
    const advanced = enrolledRows.filter((e) => e.currentStep > s.order || e.status === 'completed').length
    return { stepOrder: s.order, templateId: s.templateId, ...c, advanced }
  })
}

// ─── Step ops ─────────────────────────────────────────────────────────
export async function addStep(userId: string, campaignId: number, templateId: number, delayHours: number, stopOnReply: boolean) {
  const owned = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
  if (owned.length === 0) throw new Error('Campaign not found')
  // Without this check a user could attach another tenant's template id to
  // their own campaign — never let cross-tenant references through.
  if (!(await userOwnsTemplate(userId, templateId))) throw new Error('Template not found')
  const existing = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, campaignId))
  await db.insert(campaignSteps).values({
    campaignId, templateId,
    order: existing.length, // 0-based — first step is index 0
    delayHours: Math.max(0, delayHours | 0),
    stopOnReply,
  })
}

export async function removeStep(userId: string, campaignId: number, stepId: number) {
  const owned = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
  if (owned.length === 0) throw new Error('Campaign not found')
  await db.delete(campaignSteps).where(and(eq(campaignSteps.id, stepId), eq(campaignSteps.campaignId, campaignId)))
  // Re-pack order so subsequent steps stay contiguous.
  const left = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, campaignId)).orderBy(asc(campaignSteps.order))
  for (let i = 0; i < left.length; i++) {
    if (left[i]!.order !== i) await db.update(campaignSteps).set({ order: i }).where(eq(campaignSteps.id, left[i]!.id))
  }
}

export async function moveStep(userId: string, campaignId: number, stepId: number, direction: 'up' | 'down') {
  const owned = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
  if (owned.length === 0) throw new Error('Campaign not found')
  const all = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, campaignId)).orderBy(asc(campaignSteps.order))
  const idx = all.findIndex((s) => s.id === stepId)
  if (idx < 0) return
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= all.length) return
  const a = all[idx]!, b = all[swap]!
  // Two-step swap avoids the UNIQUE constraint on (campaign_id, order) — if
  // we ever add one. Setting both to negative first keeps things consistent.
  await db.update(campaignSteps).set({ order: -1 }).where(eq(campaignSteps.id, a.id))
  await db.update(campaignSteps).set({ order: a.order }).where(eq(campaignSteps.id, b.id))
  await db.update(campaignSteps).set({ order: b.order }).where(eq(campaignSteps.id, a.id))
}

// ─── Enrollment ───────────────────────────────────────────────────────
export interface EnrollOpts { tag?: string; contactIds?: number[] }

export async function enroll(userId: string, campaignId: number, opts: EnrollOpts): Promise<{ enrolled: number }> {
  const owned = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
  if (owned.length === 0) throw new Error('Campaign not found')
  let pool: Contact[]
  if (opts.contactIds && opts.contactIds.length > 0) {
    pool = await db.select().from(contacts).where(and(eq(contacts.userId, userId), inArray(contacts.id, opts.contactIds)))
  } else if (opts.tag) {
    const t = opts.tag.toLowerCase()
    pool = await db.select().from(contacts).where(and(
      eq(contacts.userId, userId),
      sql`(',' || ${contacts.tags} || ',') LIKE ${'%,' + t + ',%'}`
    ))
  } else {
    pool = await db.select().from(contacts).where(eq(contacts.userId, userId))
  }
  // Don't enroll an already-enrolled contact twice.
  const existing = new Set(
    (await db.select({ cid: campaignEnrollments.contactId })
      .from(campaignEnrollments).where(eq(campaignEnrollments.campaignId, campaignId)))
      .map((r) => r.cid)
  )
  const toEnroll = pool.filter((c) => !existing.has(c.id))
  if (toEnroll.length === 0) return { enrolled: 0 }
  const now = Date.now()
  // Batch insert all at once; onConflictDoNothing() handles any race where
  // a concurrent enroll() wins on the UNIQUE (campaignId, contactId) index.
  await db.insert(campaignEnrollments)
    .values(toEnroll.map((c) => ({
      campaignId, contactId: c.id, currentStep: 0,
      nextRunAt: now, status: 'active' as const,
    })))
    .onConflictDoNothing()
  return { enrolled: toEnroll.length }
}
