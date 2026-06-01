'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/schedule'

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
    return { error: e instanceof Error ? e.message : 'Schedule failed' }
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
    return { error: e instanceof Error ? e.message : 'Schedule failed' }
  }
}

export async function cancelScheduleAction() {
  const u = await requireUser()
  const r = await svc.cancelAll(u.id)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}

export async function cancelSelectedAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No rows selected' }
  const r = await svc.cancelByIds(u.id, ids)
  revalidatePath('/schedule')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}
