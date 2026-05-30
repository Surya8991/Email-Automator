import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { drafts, contacts, events, type Contact, type Template } from '@/server/db/schema'
import { personalize } from '@/lib/escape'
import { sendMail } from './mailer'
import { emit } from '@/server/sse'

/** Build the personalized HTML body + subject for one (contact, template) pair. */
export function buildEmail(template: Template, contact: Contact, signature = '') {
  const data: Record<string, string> = {
    email: contact.recruiterEmail,
    name: contact.recruiterName,
    company: contact.company,
    role_name: contact.jobTitle,
    location: contact.location,
    platform: contact.platform,
  }
  return {
    to: contact.recruiterEmail,
    subject: personalize(template.subject, data, 'subject'),
    html: personalize(template.initialMsg, data, 'html') + signature,
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
    await db.update(contacts).set({ emailStatus: `Draft Created (${new Date().toLocaleString()})` })
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
  await sendMail({ to: draft.toEmail, subject: draft.subject, html: draft.htmlBody, text: draft.plainBody })
  await db.update(drafts).set({ status: 'sent' }).where(eq(drafts.id, draft.id))
  if (draft.contactId) {
    await db.update(contacts).set({ emailStatus: `Sent (${new Date().toLocaleString()})` })
      .where(eq(contacts.id, draft.contactId))
  }
  await db.insert(events).values({
    userId, contactId: draft.contactId ?? null, kind: 'sent',
    meta: JSON.stringify({ subject: draft.subject }),
  })
}

export async function deleteDraft(userId: string, draftId: number) {
  await db.delete(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
}
