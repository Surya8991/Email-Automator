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

export async function sendDraftAction(id: number, opts: { force?: boolean } = {}) {
  const u = await requireUser()
  // Duplicate-send guard. Look up the draft's recipient, check whether
  // they were already sent to in the last 7 days. If yes and !force,
  // return a warning so the UI can confirm. force=true bypasses.
  const allPending = await drafts.listDrafts(u.id, 1, 200)
  const target = allPending.rows.find((d) => d.id === id)
  if (target && !opts.force) {
    const recent = await drafts.lastSentTo(u.id, target.toEmail, 7)
    if (recent) {
      return {
        warning: 'recent-send' as const,
        email: target.toEmail,
        lastSentAt: recent.toISOString(),
      }
    }
  }
  await drafts.sendDraft(u.id, id)
  revalidatePath('/drafts')
  return { ok: true as const }
}

// Schedule a single follow-up for one contact, N days from now, using the
// active template. UI exposes this as a "Schedule follow-up" button on each
// contact row + on each draft row. Wraps the existing scheduler — the
// follow-up appears in /schedule like any other queued row.
export async function scheduleFollowupAction(contactId: number, days: number) {
  const u = await requireUser()
  try {
    const r = await drafts.scheduleFollowup(u.id, contactId, days)
    revalidatePath('/contacts')
    revalidatePath('/schedule')
    revalidatePath('/dashboard')
    return { ok: true as const, ...r }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Schedule failed' }
  }
}

export async function deleteDraftAction(id: number) {
  const u = await requireUser()
  await drafts.deleteDraft(u.id, id)
  revalidatePath('/drafts')
  return { ok: true }
}

export async function updateDraftAction(id: number, fields: { subject?: string; htmlBody?: string }) {
  const u = await requireUser()
  await drafts.updateDraft(u.id, id, fields)
  revalidatePath('/drafts')
  return { ok: true }
}

// Retry just the drafts that previously failed (status === 'failed-send').
// MVP: we don't track per-draft failure state separately yet, so this
// re-fires anything pending in the queue — same as sendAll. Kept as its
// own action so the UI button can be wired without changing semantics
// later when we add a "failed" sub-state.
export async function retryFailedAction() {
  const u = await requireUser()
  const r = await drafts.sendAllDrafts(u.id, 50)
  revalidatePath('/drafts')
  return { ok: true, ...r }
}

export async function sendAllAction() {
  const u = await requireUser()
  const r = await drafts.sendAllDrafts(u.id, 50)
  revalidatePath('/drafts')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}
