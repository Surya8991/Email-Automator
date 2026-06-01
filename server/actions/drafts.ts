'use server'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { requireUser, requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { drafts as draftsTable, auditLog } from '@/server/db/schema'
import { getActive } from '@/server/services/templates'
import * as drafts from '@/server/services/drafts'
import { draftEmail, type Tone } from '@/server/services/ai'

export async function createDraftsAction(count: number) {
  const u = await requireUser()
  const tpl = await getActive(u.id)
  if (!tpl) return { error: 'No active template' }
  const max = Math.min(50, Math.max(1, count | 0 || 10))
  const r = await drafts.createDraftsBulk(u.id, tpl, max)
  revalidatePath('/drafts')
  return { ok: true, ...r }
}

/**
 * Create drafts for a user-picked subset of contacts (vs. createDraftsAction
 * which auto-picks the first N eligible). Wired to the Contacts page bulk
 * toolbar so the user can checkbox-select then "Create drafts for these N".
 */
export async function createDraftsForSelectedAction(contactIds: number[]) {
  const u = await requireUser()
  const tpl = await getActive(u.id)
  if (!tpl) return { error: 'No active template — pick one in /templates first' }
  if (!contactIds || contactIds.length === 0) return { error: 'No contacts selected' }
  if (contactIds.length > 200) return { error: 'Pick at most 200 contacts at a time' }
  const r = await drafts.createDraftsForContacts(u.id, tpl, contactIds)
  revalidatePath('/contacts')
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

/**
 * Send only the user-selected draft ids. Mirrors sendAllDrafts but
 * scoped to the picked set. Each failure is counted, none aborts.
 */
export async function sendSelectedDraftsAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No drafts selected' }
  if (ids.length > 100) return { error: 'Pick at most 100 drafts at a time' }
  let sent = 0, failed = 0
  for (const id of ids) {
    try { await drafts.sendDraft(u.id, id); sent++ }
    catch { failed++ }
  }
  revalidatePath('/drafts')
  revalidatePath('/dashboard')
  return { ok: true, sent, failed }
}

export async function sendAllAction() {
  const u = await requireUser()
  const r = await drafts.sendAllDrafts(u.id, 50)
  revalidatePath('/drafts')
  revalidatePath('/dashboard')
  return { ok: true, ...r }
}

// Discard a user-picked subset of pending drafts. Mirrors
// sendSelectedDraftsAction's shape — same 100-row cap, same scope guard.
export async function deleteSelectedDraftsAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No drafts selected' }
  if (ids.length > 500) return { error: 'Pick at most 500 drafts at a time' }
  const deleted = await drafts.deleteDraftsBulk(u.id, ids)
  revalidatePath('/drafts')
  return { ok: true, deleted }
}

// Discard every pending draft. UI MUST double-confirm.
export async function deleteAllDraftsAction() {
  const u = await requireUser()
  const deleted = await drafts.deleteAllPendingDrafts(u.id)
  revalidatePath('/drafts')
  return { ok: true, deleted }
}

// AI Improve — admin-only. Pulls the draft's current body, asks Groq to
// rewrite it in the chosen tone keeping intent intact, and saves the new
// body back. Returns the new HTML so the client can swap the row content
// without a full reload. Non-admins never see the button; the
// requireAdmin() guard catches anyone who hits the action directly.
export async function improveDraftAction(id: number, tone: Tone = 'professional') {
  const me = await requireAdmin()
  const [d] = await db.select().from(draftsTable)
    .where(and(eq(draftsTable.id, id), eq(draftsTable.userId, me.id)))
  if (!d) return { error: 'Draft not found' }
  let improved: string
  try {
    improved = await draftEmail(me.id, {
      existing: d.htmlBody,
      tone,
      goal: 'Improve the email below — keep the intent and any {{variables}} intact, tighten language, fix awkward phrasing, match the requested tone.',
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'AI request failed' }
  }
  await drafts.updateDraft(me.id, id, { htmlBody: improved })
  // Admin AI use is logged so /audit?scope=all can show which admin
  // called the AI and how often. Non-fatal if the insert blips.
  try { await db.insert(auditLog).values({ userId: me.id, action: 'admin.ai_improve_draft', detail: `draft_id=${id} tone=${tone}`, ip: '' }) } catch { /* noop */ }
  revalidatePath('/drafts')
  return { ok: true, htmlBody: improved }
}
