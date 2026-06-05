'use server'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdmin, requireUser } from '@/auth'
import * as svc from '@/server/services/schedule'
import { actionError } from '@/lib/action-error'
import { db } from '@/server/db/client'
import { emailLog, auditLog } from '@/server/db/schema'
import { draftEmail, type Tone } from '@/server/services/ai'
import { adminLimit } from '@/server/actions/admin'

const Schema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  // Optional. UI ships the user's chosen min/max gap (in minutes) between
  // sends. Clamped 0–240 — anything beyond 4 h between sends is almost
  // certainly a typo, not a real schedule.
  intervalMin: z.number().int().min(0).max(240).optional(),
  intervalMax: z.number().int().min(0).max(240).optional(),
})

function parseStart(input: z.infer<typeof Schema>): number | null {
  const ms = new Date(`${input.startDate}T${input.startTime}`).getTime()
  return Number.isFinite(ms) ? ms : null
}

export async function previewScheduleAction(input: z.infer<typeof Schema>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const start = parseStart(parsed.data)
  if (!start) return { error: 'Invalid date/time' }
  const r = await svc.previewSchedule(u.id, start, {
    intervalMin: parsed.data.intervalMin,
    intervalMax: parsed.data.intervalMax,
  })
  return r
}

export async function enqueueScheduleAction(input: z.infer<typeof Schema>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const start = parseStart(parsed.data)
  if (!start) return { error: 'Invalid date/time' }
  if (start <= Date.now()) return { error: 'Start time must be in the future' }
  try {
    const r = await svc.enqueue(u.id, start, {
      intervalMin: parsed.data.intervalMin,
      intervalMax: parsed.data.intervalMax,
    })
    revalidatePath('/schedule')
    revalidatePath('/dashboard')
    return { ok: true, ...r }
  } catch (e) {
    return actionError(e, 'Schedule failed')
  }
}

// Schedule the explicitly-selected contact ids — used by the /contacts
// bulk toolbar's "Schedule…" button. Tenancy enforced inside the service.
const SelectedSchema = Schema.extend({
  contactIds: z.array(z.number().int().positive()).min(1).max(2000),
})
export async function enqueueSelectedScheduleAction(input: z.infer<typeof SelectedSchema>) {
  const u = await requireUser()
  const parsed = SelectedSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const start = parseStart(parsed.data)
  if (!start) return { error: 'Invalid date/time' }
  if (start <= Date.now()) return { error: 'Start time must be in the future' }
  try {
    const r = await svc.enqueueContacts(u.id, parsed.data.contactIds, start, {
      intervalMin: parsed.data.intervalMin,
      intervalMax: parsed.data.intervalMax,
    })
    revalidatePath('/schedule')
    revalidatePath('/contacts')
    revalidatePath('/dashboard')
    return { ok: true, ...r }
  } catch (e) {
    return actionError(e, 'Schedule failed')
  }
}

export async function cancelScheduleAction() {
  const u = await requireUser()
  const r = await svc.cancelAll(u.id)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}

// Admin-only AI Improve for a queued email. Rewrites emailLog.body in place
// using the same Groq prompt that drafts use, then audit-logs the action.
// The scheduler tick picks up the new body on its next pass — no schedule
// change. Caller (UI) opens a preview after this fires so the admin can
// review before the worker sends.
const TONE_LIST = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const
export async function improveScheduledEmailAction(id: number, tone: Tone = 'professional') {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'improve_scheduled')) {
    return { error: 'Too many admin actions — slow down' }
  }
  if (!TONE_LIST.includes(tone)) return { error: 'Invalid tone' }
  const [row] = await db.select().from(emailLog)
    .where(and(eq(emailLog.id, id), eq(emailLog.userId, me.id)))
  if (!row) return { error: 'Scheduled email not found' }
  if (row.status !== 'Scheduled' && row.status !== 'Retrying') {
    return { error: `Cannot improve a "${row.status}" row` }
  }
  let improved: string
  try {
    improved = await draftEmail(me.id, {
      existing: row.body,
      tone,
      goal: 'Improve the email below — keep the intent and any {{variables}} intact, tighten language, fix awkward phrasing, match the requested tone.',
    })
  } catch (e) {
    return actionError(e, 'AI request failed')
  }
  await db.update(emailLog).set({ body: improved }).where(eq(emailLog.id, id))
  try { await db.insert(auditLog).values({ userId: me.id, action: 'admin.ai_improve_scheduled', detail: `email_log_id=${id} tone=${tone}`, ip: '' }) } catch { /* noop */ }
  revalidatePath('/schedule')
  return { ok: true as const, body: improved }
}

export async function cancelSelectedAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No rows selected' }
  const r = await svc.cancelByIds(u.id, ids)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}
