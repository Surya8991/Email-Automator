'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/blocklist'

const Schema = z.object({
  pattern: z.string().min(3).max(120),
  type: z.enum(['email', 'domain']),
})

export async function addBlocklistAction(input: z.infer<typeof Schema>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  await svc.addEntry(u.id, parsed.data.pattern, parsed.data.type)
  revalidatePath('/blocklist')
  return { ok: true }
}

export async function removeBlocklistAction(id: number) {
  const u = await requireUser()
  await svc.removeEntry(u.id, id)
  revalidatePath('/blocklist')
  return { ok: true }
}

// Bulk remove — used by the "Remove selected" toolbar action on /blocklist.
// Tenancy guard lives in the service (WHERE userId = u.id), so a passed-in
// global-row id is silently a no-op.
export async function bulkRemoveBlocklistAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No rows selected' }
  if (ids.length > 1000) return { error: 'Pick at most 1000 rows at a time' }
  const removed = await svc.removeEntries(u.id, ids)
  revalidatePath('/blocklist')
  return { ok: true, removed }
}

// Bulk import — paste a newline/comma-separated list. Anything containing
// "@" is treated as an email, otherwise as a domain. Skips duplicates and
// empty lines silently; returns counters.
export async function bulkAddBlocklistAction(text: string): Promise<{ ok: boolean; added: number; skipped: number }> {
  const u = await requireUser()
  const items = text.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  let added = 0, skipped = 0
  for (const raw of items) {
    if (raw.length < 3 || raw.length > 120) { skipped++; continue }
    const type = raw.includes('@') ? 'email' : 'domain'
    try { await svc.addEntry(u.id, raw, type); added++ }
    catch { skipped++ }
  }
  revalidatePath('/blocklist')
  return { ok: true, added, skipped }
}
