'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/schedule'

const Schema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
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
  const r = await svc.previewSchedule(u.id, start)
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
    const r = await svc.enqueue(u.id, start)
    revalidatePath('/schedule')
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
