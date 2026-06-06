import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { drafts, contacts, emailLog, events, type Contact, type Template } from '@/server/db/schema'
import { personalize } from '@/lib/escape'
import { wrapEmailHtml } from '@/lib/email-template'
import { formatDate } from '@/lib/utils'
import { readCustomFields } from '@/lib/custom-fields'
import { sendMail } from './mailer'
import { emit } from '@/server/sse'
import { instrumentHtml } from './tracking'

/**
 * Build the personalized HTML body + subject for one (contact, template) pair.
 * If the template has a subjectB, half the audience gets it (deterministic
 * 50/50 hash on the contact id, so the same recipient never sees both).
 */
export function buildEmail(template: Template, contact: Contact, signature = '') {
  // Custom fields from the contact's notes JSON block, lowercased. Stomp
  // is "built-in wins" — a custom field named "name" can't override the
  // recipient name (would be confusing).
  const custom = readCustomFields(contact.notes)
  const data: Record<string, string> = {
    ...custom,
    email: contact.recruiterEmail,
    name: contact.recruiterName,
    company: contact.company,
    role_name: contact.jobTitle,
    location: contact.location,
    platform: contact.platform,
  }
  const useB = template.subjectB && template.subjectB.trim() && (contact.id % 2 === 1)
  const rawSubject = useB ? template.subjectB : template.subject
  const subject = personalize(rawSubject, data, 'subject')
  const bodyHtml = personalize(template.initialMsg, data, 'html')
  // Wrap in the polished email shell so every template — old or new —
  // renders with consistent typography, spacing, and a clean card layout.
  // Signature is rendered inside the wrapper, divider above it.
  const fullHtml = wrapEmailHtml(bodyHtml, {
    signature,
    // Preheader = subject line by default; gives a non-empty inbox preview
    // without leaking body content the first 100 chars would.
    preheader: subject,
  })
  return {
    to: contact.recruiterEmail,
    subject,
    subjectVariant: useB ? 'B' as const : 'A' as const,
    html: fullHtml,
    text: personalize(template.initialMsg, data, 'text'),
  }
}

export async function listDrafts(userId: string, page = 1, pageSize = 50) {
  // Cap at 1000 to match the /contacts page-size selector — server hard
  // limit so a bad ?pageSize= URL can't over-fetch.
  const cappedSize = Math.min(1000, Math.max(1, pageSize))
  const offset = (page - 1) * cappedSize
  const rows = await db
    .select({
      id: drafts.id, userId: drafts.userId, contactId: drafts.contactId,
      toEmail: drafts.toEmail, subject: drafts.subject,
      htmlBody: drafts.htmlBody, plainBody: drafts.plainBody,
      status: drafts.status, createdAt: drafts.createdAt,
      // Contact context — populated when draft was created from a job lead
      contactPlatform: contacts.platform,
      contactJobTitle: contacts.jobTitle,
      contactCompany: contacts.company,
      contactLocation: contacts.location,
      contactSourceUrl: contacts.sourceUrl,
    })
    .from(drafts)
    .leftJoin(contacts, eq(drafts.contactId, contacts.id))
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
    .orderBy(desc(drafts.id)).limit(cappedSize).offset(offset)
  const countRows = await db.select({ n: sql<number>`COUNT(*)` }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
  return { rows, total: Number(countRows[0]?.n ?? 0), page, pageSize: cappedSize }
}

/**
 * Create drafts for a SPECIFIC list of contact ids using the given
 * template. Skips contacts already in Draft/Sent state (so re-running
 * with overlapping selections doesn't double-up). Returns counters.
 */
export async function createDraftsForContacts(
  userId: string, template: Template, contactIds: number[],
): Promise<{ created: number; skipped: number }> {
  if (contactIds.length === 0) return { created: 0, skipped: 0 }
  const rows = await db.select().from(contacts).where(and(
    eq(contacts.userId, userId),
    inArray(contacts.id, contactIds),
    sql`${contacts.recruiterEmail} != ''`,
  ))
  let created = 0, skipped = 0
  for (const contact of rows) {
    const st = contact.emailStatus
    if (st && (st.includes('Draft Created') || st.startsWith('Sent') || st.includes('Sent ('))) {
      skipped++; continue
    }
    const email = buildEmail(template, contact)
    await db.insert(drafts).values({
      userId, contactId: contact.id,
      toEmail: email.to, subject: email.subject,
      htmlBody: email.html, plainBody: email.text ?? '',
    })
    // Defense-in-depth: scope the update by userId too. The contact rows
    // came from a userId-filtered SELECT, so this is belt-and-braces, but
    // it ensures a future code path that injects untrusted contact ids
    // can't update another user's rows.
    await db.update(contacts).set({ emailStatus: `Draft Created (${formatDate(new Date())})` })
      .where(and(eq(contacts.id, contact.id), eq(contacts.userId, userId)))
    created++
  }
  return { created, skipped }
}

/**
 * Filters narrow which contacts are eligible for draft creation. All
 * optional; ANDed together. Used by the CreateDraftsDialog to let the
 * user batch-create drafts for a slice (e.g. "10 LinkedIn PMs in
 * Bangalore I haven't emailed in the last 30 days") without first
 * filtering the contacts table.
 */
export interface DraftFilters {
  platforms?: string[]
  jobTitleContains?: string
  locationContains?: string
  /** Skip contacts emailed in the last N days. */
  skipRecentDays?: number
}

// Build the SQL WHERE shared by createDraftsBulk + countEligible. Pulled
// into a helper so the dialog's "live eligible" count uses the same
// rules as the actual create — no drift between preview and reality.
function eligibleWhere(userId: string, filters: DraftFilters = {}) {
  const clauses = [
    eq(contacts.userId, userId),
    sql`${contacts.recruiterEmail} != ''`,
    sql`${contacts.emailStatus} NOT LIKE '%Draft Created%'`,
    sql`${contacts.emailStatus} NOT LIKE '%Sent%'`,
  ]
  if (filters.platforms && filters.platforms.length > 0) {
    // Lowercased substring match per platform — drizzle's inArray would
    // be exact-match and platforms are user-entered free text (LinkedIn
    // vs LinkedIN vs linkedin etc). Cap at 10 to keep the SQL bounded.
    const trimmed = filters.platforms.slice(0, 10).map((p) => p.trim().toLowerCase()).filter(Boolean)
    if (trimmed.length > 0) {
      const ors = trimmed.map((p) => sql`LOWER(${contacts.platform}) LIKE ${'%' + p + '%'}`)
      clauses.push(sql`(${sql.join(ors, sql` OR `)})`)
    }
  }
  if (filters.jobTitleContains && filters.jobTitleContains.trim()) {
    clauses.push(sql`LOWER(${contacts.jobTitle}) LIKE ${'%' + filters.jobTitleContains.trim().toLowerCase() + '%'}`)
  }
  if (filters.locationContains && filters.locationContains.trim()) {
    clauses.push(sql`LOWER(${contacts.location}) LIKE ${'%' + filters.locationContains.trim().toLowerCase() + '%'}`)
  }
  if (filters.skipRecentDays && filters.skipRecentDays > 0) {
    // Anti-join via NOT EXISTS — exclude contacts whose recruiterEmail
    // appears in a Sent email_log row within the window. Per-user
    // scoped so a shared address (rare) only affects the same user.
    const since = Date.now() - filters.skipRecentDays * 24 * 60 * 60 * 1000
    clauses.push(sql`NOT EXISTS (
      SELECT 1 FROM email_log el
      WHERE el.user_id = ${userId}
        AND LOWER(el.email) = LOWER(${contacts.recruiterEmail})
        AND el.status = 'Sent'
        AND el.scheduled_at >= ${since}
    )`)
  }
  return and(...clauses)
}

/**
 * Live "X eligible / Y total" counter for the CreateDraftsDialog.
 * Cheap — two COUNTs over the contacts table. Sample is the first 5
 * matches so the user sees who the batch would target before clicking
 * Create.
 */
export async function countEligible(userId: string, filters: DraftFilters = {}): Promise<{
  eligible: number
  total: number
  sample: Array<{ id: number; recruiterName: string; company: string; recruiterEmail: string; jobTitle: string; platform: string }>
}> {
  const elig = await db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eligibleWhere(userId, filters))
  const total = await db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, userId))
  const sample = await db.select({
    id: contacts.id,
    recruiterName: contacts.recruiterName,
    company: contacts.company,
    recruiterEmail: contacts.recruiterEmail,
    jobTitle: contacts.jobTitle,
    platform: contacts.platform,
  }).from(contacts).where(eligibleWhere(userId, filters)).limit(5)
  return {
    eligible: Number(elig[0]?.n ?? 0),
    total: Number(total[0]?.n ?? 0),
    sample,
  }
}

export async function createDraftsBulk(
  userId: string,
  template: Template,
  max: number,
  filters: DraftFilters = {},
) {
  const ready = await db.select().from(contacts).where(eligibleWhere(userId, filters)).limit(max)

  emit(userId, { type: 'draft_start', total: ready.length })
  let processed = 0
  for (const contact of ready) {
    const email = buildEmail(template, contact)
    await db.insert(drafts).values({
      userId, contactId: contact.id,
      toEmail: email.to, subject: email.subject,
      htmlBody: email.html, plainBody: email.text ?? '',
    })
    await db.update(contacts).set({ emailStatus: `Draft Created (${formatDate(new Date())})` })
      .where(eq(contacts.id, contact.id))
    processed += 1
    emit(userId, { type: 'draft_progress', processed, total: ready.length, email: email.to })
  }
  emit(userId, { type: 'draft_done', processed, total: ready.length })
  return { processed, total: ready.length }
}

export async function sendDraft(userId: string, draftId: number) {
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
  if (!draft) throw new Error('Draft not found')

  // Create an email_log row FIRST so we have an id to embed in the tracking
  // pixel and click URLs. The row records the actual sent state.
  const inserted = await db.insert(emailLog).values({
    userId, contactId: draft.contactId ?? null,
    scheduleId: `send_${Date.now()}_${draft.id}`,
    email: draft.toEmail, subject: draft.subject, body: draft.htmlBody,
    scheduledAt: Date.now(), status: 'Sent', attempts: 1,
    lastResult: formatDate(new Date()),
  }).returning({ id: emailLog.id })
  const logId = inserted[0]!.id

  const html = instrumentHtml(draft.htmlBody, logId)
  await sendMail({ to: draft.toEmail, subject: draft.subject, html, text: draft.plainBody }, userId)
  // Defense-in-depth: every mutation scoped to (userId, id) even though
  // the SELECT above already filtered. Draft and contact ids are server-
  // derived here; the guard catches future misuses.
  await db.update(drafts).set({ status: 'sent' })
    .where(and(eq(drafts.id, draft.id), eq(drafts.userId, userId)))
  if (draft.contactId) {
    await db.update(contacts).set({ emailStatus: `Sent (${formatDate(new Date())})` })
      .where(and(eq(contacts.id, draft.contactId), eq(contacts.userId, userId)))
  }
  await db.insert(events).values({
    userId, contactId: draft.contactId ?? null, kind: 'sent',
    meta: JSON.stringify({ subject: draft.subject, emailLogId: logId }),
  })
}

export async function deleteDraft(userId: string, draftId: number) {
  await db.delete(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
}

// Bulk discard — only ids belonging to this user are touched (tenancy guard
// inside the WHERE). Ids of someone else's drafts silently no-op. Returns
// the actual delete count so the UI toast can be accurate even when the
// caller's selection contained stale ids.
export async function deleteDraftsBulk(userId: string, ids: number[]): Promise<number> {
  if (!ids || ids.length === 0) return 0
  // Only drop drafts that are still pending — sent ones shouldn't be wiped
  // because their email_log row tracks history. The status filter mirrors
  // the listDrafts view so the user can't accidentally delete what they
  // already sent.
  await db.delete(drafts).where(and(
    eq(drafts.userId, userId),
    eq(drafts.status, 'draft'),
    inArray(drafts.id, ids),
  ))
  return ids.length
}

// Discard every pending draft for this user. Used by the "Discard all"
// button in /drafts. Returns the count for the toast.
export async function deleteAllPendingDrafts(userId: string): Promise<number> {
  const before = await db.select({ n: sql<number>`COUNT(*)` }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
  const n = Number(before[0]?.n ?? 0)
  if (n === 0) return 0
  await db.delete(drafts).where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
  return n
}

/**
 * Was this email address sent to within the last `windowDays` days?
 * Used by the duplicate-send guard to warn the user before they send to
 * someone they just contacted.
 */
export async function lastSentTo(userId: string, email: string, windowDays = 7): Promise<Date | null> {
  const since = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const rows = await db.select({ ts: emailLog.scheduledAt }).from(emailLog)
    .where(and(
      eq(emailLog.userId, userId),
      sql`LOWER(${emailLog.email}) = LOWER(${email})`,
      eq(emailLog.status, 'Sent'),
      sql`${emailLog.scheduledAt} >= ${since}`,
    ))
    .orderBy(desc(emailLog.scheduledAt)).limit(1)
  return rows[0] ? new Date(rows[0].ts) : null
}

/**
 * Schedule a follow-up email to one contact, `days` days from now, using
 * the user's currently-active template. Mirrors what the scheduler tick
 * does to bulk schedules — same emailLog row shape, status='Scheduled',
 * picked up on the next tick. Returns the scheduled timestamp.
 */
export async function scheduleFollowup(
  userId: string, contactId: number, days: number,
): Promise<{ at: number; subject: string }> {
  const { getActive } = await import('./templates')
  const tpl = await getActive(userId)
  if (!tpl) throw new Error('No active template — pick one in /templates first')
  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
  if (!contact) throw new Error('Contact not found')
  if (!contact.recruiterEmail) throw new Error('Contact has no email')
  const at = Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000
  const email = buildEmail(tpl, contact)
  await db.insert(emailLog).values({
    userId, contactId,
    scheduleId: `fup_${at}_${contactId}`,
    email: contact.recruiterEmail, subject: email.subject, body: email.html,
    scheduledAt: at, status: 'Scheduled',
  })
  return { at, subject: email.subject }
}

/**
 * Update a pending draft's subject and body. Lets the user fix typos or
 * personalize per-recipient before sending — previously they had to
 * delete + recreate from a template change.
 */
export async function updateDraft(
  userId: string, draftId: number,
  fields: { subject?: string; htmlBody?: string; plainBody?: string },
) {
  const patch: { subject?: string; htmlBody?: string; plainBody?: string } = {}
  if (fields.subject !== undefined) patch.subject = fields.subject.slice(0, 500)
  if (fields.htmlBody !== undefined) patch.htmlBody = fields.htmlBody
  if (fields.plainBody !== undefined) patch.plainBody = fields.plainBody
  if (Object.keys(patch).length === 0) return
  await db.update(drafts).set(patch)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, userId), eq(drafts.status, 'draft')))
}

// Send every pending draft, one at a time. Each failure is counted but
// doesn't abort the loop — best-effort, returns counters for the caller.
export async function sendAllDrafts(userId: string, max = 50): Promise<{ sent: number; failed: number }> {
  const pending = await db.select().from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft'))).limit(max)
  let sent = 0, failed = 0
  for (const d of pending) {
    try { await sendDraft(userId, d.id); sent++ }
    catch { failed++ }
  }
  return { sent, failed }
}
