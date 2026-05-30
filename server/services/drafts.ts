import { and, desc, eq, sql } from 'drizzle-orm'
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

export async function listDrafts(userId: string, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize
  const rows = await db.select().from(drafts).where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
    .orderBy(desc(drafts.id)).limit(pageSize).offset(offset)
  const countRows = await db.select({ n: sql<number>`COUNT(*)` }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
  return { rows, total: Number(countRows[0]?.n ?? 0), page, pageSize }
}

export async function createDraftsBulk(userId: string, template: Template, max: number) {
  const ready = await db.select().from(contacts).where(
    and(
      eq(contacts.userId, userId),
      sql`${contacts.recruiterEmail} != ''`,
      sql`${contacts.emailStatus} NOT LIKE '%Draft Created%'`,
      sql`${contacts.emailStatus} NOT LIKE '%Sent%'`
    )
  ).limit(max)

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
  await db.update(drafts).set({ status: 'sent' }).where(eq(drafts.id, draft.id))
  if (draft.contactId) {
    await db.update(contacts).set({ emailStatus: `Sent (${formatDate(new Date())})` })
      .where(eq(contacts.id, draft.contactId))
  }
  await db.insert(events).values({
    userId, contactId: draft.contactId ?? null, kind: 'sent',
    meta: JSON.stringify({ subject: draft.subject, emailLogId: logId }),
  })
}

export async function deleteDraft(userId: string, draftId: number) {
  await db.delete(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
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
