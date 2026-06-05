'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/job-tracker'
import { fetchForAi } from '@/server/services/ai-generate'
import { actionError } from '@/lib/action-error'
import { rateLimit } from '@/lib/rate-limit'

const AddSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().min(8).max(500),
  keywords: z.string().max(400).optional(),
})

export async function addJobSourceAction(input: z.infer<typeof AddSchema>) {
  const u = await requireUser()
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`job-add:${u.id}`, 10, 60_000)) return { error: 'Slow down — try again in a minute' }
  // Re-use the SSRF-defended URL validator from ai-generate. We don't
  // actually need the response here, only the validation — so request
  // a tiny range; if the URL fails the guard it's rejected.
  const sanity = await fetchForAi(parsed.data.url).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' } as const))
  if (!sanity.ok) {
    return { error: `URL rejected: ${'error' in sanity ? sanity.error : 'invalid'}` }
  }
  try {
    await svc.createSource(u.id, parsed.data.label, parsed.data.url, parsed.data.keywords ?? '')
    revalidatePath('/jobs')
    return { ok: true as const }
  } catch (e) {
    return actionError(e, 'Add failed')
  }
}

export async function deleteJobSourceAction(id: number) {
  const u = await requireUser()
  await svc.deleteSource(u.id, id)
  revalidatePath('/jobs')
  return { ok: true as const }
}

export async function refreshJobSourceAction(id: number) {
  const u = await requireUser()
  // Manual refresh is heavier than cron — rate-limit 6/min/user.
  if (!rateLimit(`job-refresh:${u.id}`, 6, 60_000)) return { error: 'Too many refreshes — wait a minute' }
  try {
    const r = await svc.tickSourceById(u.id, id)
    revalidatePath('/jobs')
    return { ok: true as const, ...r }
  } catch (e) {
    return actionError(e, 'Refresh failed')
  }
}

export async function setJobLeadStatusAction(id: number, status: 'new' | 'saved' | 'ignored' | 'applied') {
  const u = await requireUser()
  await svc.setLeadStatus(u.id, id, status)
  revalidatePath('/jobs')
  return { ok: true as const }
}
