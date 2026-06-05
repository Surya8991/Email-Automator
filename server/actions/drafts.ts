'use server'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { requireUser, requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { drafts as draftsTable, templates as templatesTable, auditLog } from '@/server/db/schema'
import { getActive } from '@/server/services/templates'
import * as drafts from '@/server/services/drafts'
import * as schedule from '@/server/services/schedule'
import { draftEmail, type Tone } from '@/server/services/ai'
import { notify } from '@/server/services/notify'
import { actionError } from '@/lib/action-error'
import { rateLimit } from '@/lib/rate-limit'

// Resolve which template to use for a batch — explicit pickedTemplateId
// wins (one-off override), otherwise fall back to the active template.
// Always tenancy-scoped: a pickedTemplateId from another user silently
// no-ops via the userId guard.
async function resolveTemplate(userId: string, pickedTemplateId?: number) {
  if (pickedTemplateId && Number.isFinite(pickedTemplateId)) {
    const [row] = await db.select().from(templatesTable)
      .where(and(eq(templatesTable.id, pickedTemplateId), eq(templatesTable.userId, userId)))
    if (row) return row
  }
  return getActive(userId)
}

export interface CreateDraftsOpts {
  count: number
  templateId?: number
  filters?: drafts.DraftFilters
}

/**
 * Create drafts. Two call shapes for backwards compat with old callers:
 *   - createDraftsAction(10)                  ← legacy, uses active template, no filters
 *   - createDraftsAction({ count: 10, … })    ← new dialog-driven shape
 * The widened signature lets the CreateDraftsDialog pass templateId + filters
 * without breaking the existing UI buttons that still pass a plain number.
 */
export async function createDraftsAction(arg: number | CreateDraftsOpts) {
  const u = await requireUser()
  const opts: CreateDraftsOpts = typeof arg === 'number' ? { count: arg } : arg
  const tpl = await resolveTemplate(u.id, opts.templateId)
  if (!tpl) return { error: 'No active template — pick one in /templates first' }
  const max = Math.min(50, Math.max(1, opts.count | 0 || 10))
  const r = await drafts.createDraftsBulk(u.id, tpl, max, opts.filters ?? {})
  revalidatePath('/drafts')
  return { ok: true, ...r }
}

/**
 * Live eligible-counter for the CreateDraftsDialog. Rate-limited 30/min
 * per user so a focused dialog typing through filters can't hammer the
 * counter query. Returns the count + first-5 sample.
 */
export async function previewEligibleDraftsAction(filters: drafts.DraftFilters = {}) {
  const u = await requireUser()
  if (!rateLimit(`preview-drafts:${u.id}`, 30, 60_000)) {
    return { error: 'Too many preview requests — slow down' }
  }
  const r = await drafts.countEligible(u.id, filters)
  return { ok: true as const, ...r }
}

/**
 * Convert a user-picked subset of pending drafts into Scheduled rows in
 * email_log, starting at `startAt` with the given stagger window. The
 * draft row stays around so the user sees the conversion in their
 * /schedule page; status is bumped to 'sent' so it leaves the pending
 * list. Tenancy: only drafts owned by this user are touched.
 */
export async function scheduleSelectedDraftsAction(
  ids: number[],
  opts: { startAt: number; intervalMin?: number; intervalMax?: number },
) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No drafts selected' }
  if (ids.length > 200) return { error: 'Pick at most 200 drafts at a time' }
  const startMs = Number(opts.startAt)
  if (!Number.isFinite(startMs)) return { error: 'Invalid start time' }
  // Pull the eligible drafts; only ones we own + still pending.
  const rows = await db.select().from(draftsTable).where(and(
    eq(draftsTable.userId, u.id), eq(draftsTable.status, 'draft'),
  ))
  const idSet = new Set(ids)
  const picked = rows.filter((d) => idSet.has(d.id) && d.contactId != null)
  if (picked.length === 0) return { error: 'No matching drafts (perhaps already sent?)' }
  const contactIds = picked.map((d) => d.contactId!).filter(Boolean)
  try {
    const r = await schedule.enqueueContacts(u.id, contactIds, startMs, {
      intervalMin: opts.intervalMin,
      intervalMax: opts.intervalMax,
    })
    // Mark the matching drafts done so they leave the pending list.
    // Per-id WHERE keeps tenancy guarantee tight even though picked
    // already filtered by userId above.
    for (const d of picked) {
      await db.update(draftsTable).set({ status: 'sent' })
        .where(and(eq(draftsTable.id, d.id), eq(draftsTable.userId, u.id), eq(draftsTable.status, 'draft')))
    }
    revalidatePath('/drafts')
    revalidatePath('/schedule')
    return { ok: true as const, scheduled: r.scheduled, skipped: r.skipped + (picked.length - contactIds.length) }
  } catch (e) {
    return actionError(e, 'Schedule failed')
  }
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
    return actionError(e, 'Schedule failed')
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
  // Fire-and-forget Slack/Discord notification. notify() silently no-ops
  // when no webhook is configured; this never blocks the response.
  notify(u.id, 'send.completed', {
    title: `Sent ${sent} draft${sent === 1 ? '' : 's'}`,
    detail: failed > 0 ? `${failed} failed — check /audit for details.` : 'All clear.',
    meta: { sent, failed, scope: 'selected' },
  }).catch(() => { /* notify is best-effort */ })
  return { ok: true, sent, failed }
}

export async function sendAllAction() {
  const u = await requireUser()
  const r = await drafts.sendAllDrafts(u.id, 50)
  revalidatePath('/drafts')
  revalidatePath('/dashboard')
  notify(u.id, 'send.completed', {
    title: `Sent ${r.sent} draft${r.sent === 1 ? '' : 's'}`,
    detail: r.failed > 0 ? `${r.failed} failed — check /audit for details.` : 'All clear.',
    meta: { sent: r.sent, failed: r.failed, scope: 'all' },
  }).catch(() => { /* notify is best-effort */ })
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
  // Admin AI Improve: 60/min/admin. Caps Groq spend on a stuck loop.
  if (!rateLimit(`admin-write:${me.id}:improve_draft`, 60, 60_000)) {
    return { error: 'Too many admin actions — slow down' }
  }
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
    return actionError(e, 'AI request failed')
  }
  await drafts.updateDraft(me.id, id, { htmlBody: improved })
  // Admin AI use is logged so /audit?scope=all can show which admin
  // called the AI and how often. Non-fatal if the insert blips.
  try { await db.insert(auditLog).values({ userId: me.id, action: 'admin.ai_improve_draft', detail: `draft_id=${id} tone=${tone}`, ip: '' }) } catch { /* noop */ }
  revalidatePath('/drafts')
  return { ok: true, htmlBody: improved }
}
