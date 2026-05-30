'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { getActive } from '@/server/services/templates'
import * as drafts from '@/server/services/drafts'

export async function createDraftsAction(count: number) {
  const u = await requireUser()
  const tpl = await getActive(u.id)
  if (!tpl) return { error: 'No active template' }
  const max = Math.min(50, Math.max(1, count | 0 || 10))
  const r = await drafts.createDraftsBulk(u.id, tpl, max)
  revalidatePath('/drafts')
  return { ok: true, ...r }
}

export async function sendDraftAction(id: number) {
  const u = await requireUser()
  await drafts.sendDraft(u.id, id)
  revalidatePath('/drafts')
  return { ok: true }
}

export async function deleteDraftAction(id: number) {
  const u = await requireUser()
  await drafts.deleteDraft(u.id, id)
  revalidatePath('/drafts')
  return { ok: true }
}
