// .env loading is handled inside lib/env.ts itself so it runs before zod
// parses (ESM hoists imports, so a loader called here would run too late).
import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { campaignEnrollments, campaignSteps, contacts, emailLog, events, templates, users } from '../server/db/schema'
import { buildEmail } from '../server/services/drafts'
import { sendMail } from '../server/services/mailer'
import { instrumentHtml } from '../server/services/tracking'
import { env } from '../lib/env'

const TICK_MS = 30_000
const BATCH_PER_USER = 10
const DAILY_LIMIT = Number.isInteger(env.DAILY_SEND_LIMIT) && env.DAILY_SEND_LIMIT > 0 ? env.DAILY_SEND_LIMIT : 50

function backoffMs(attempt: number): number {
  const raw = 60_000 * Math.pow(2, Math.max(0, attempt - 1))
  const capped = Math.min(raw, 30 * 60 * 1000)
  const jitter = capped * 0.25 * (Math.random() * 2 - 1)
  return Math.max(1000, Math.floor(capped + jitter))
}

async function tickForUser(userId: string) {
  const now = Date.now()
  // Today's send count (rough: count of 'sent' events today, fast on the
  // events_user_kind_ts index).
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const sentTodayRows = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
    .where(and(eq(events.userId, userId), eq(events.kind, 'sent'), sql`${events.ts} >= ${startOfDay.getTime()}`))
  const remaining = Math.max(0, DAILY_LIMIT - Number(sentTodayRows[0]?.n ?? 0))
  if (remaining <= 0) return

  // 1. Send any scheduled email_log rows whose time has come.
  const due = await db.select().from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.status, 'Scheduled'), lte(emailLog.scheduledAt, now + 5 * 60_000)))
    .limit(Math.min(BATCH_PER_USER, remaining))
  for (const row of due) {
    try {
      // Don't fall back to subject-as-HTML — if body is empty we have nothing
      // to send, so skip this row (treat as a programming bug upstream).
      if (!row.body) {
        await db.update(emailLog).set({ status: 'Failed', lastResult: 'Empty body' }).where(eq(emailLog.id, row.id))
        continue
      }
      const html = instrumentHtml(row.body, row.id)
      await sendMail({ to: row.email, subject: row.subject, html })
      await db.update(emailLog).set({ status: 'Sent', attempts: row.attempts + 1, lastResult: new Date().toLocaleString() })
        .where(eq(emailLog.id, row.id))
      await db.insert(events).values({ userId, contactId: row.contactId ?? null, kind: 'sent', meta: JSON.stringify({ subject: row.subject, emailLogId: row.id }) })
    } catch (err) {
      const next = row.attempts + 1
      const failed = next >= 3
      const retryAt = now + backoffMs(next)
      await db.update(emailLog).set({
        status: failed ? 'Failed' : 'Retrying',
        attempts: next,
        scheduledAt: failed ? row.scheduledAt : retryAt,
        lastResult: (failed ? 'FAILED: ' : 'Retry: ') + (err instanceof Error ? err.message : String(err)),
      }).where(eq(emailLog.id, row.id))
    }
  }

  // 2. Advance any active campaign enrollments whose nextRunAt has passed.
  const enrolled = await db.select().from(campaignEnrollments)
    .where(and(eq(campaignEnrollments.status, 'active'), lte(campaignEnrollments.nextRunAt, now)))
    .limit(BATCH_PER_USER)
  for (const enr of enrolled) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, enr.contactId))
    if (!contact || contact.userId !== userId) continue
    const [step] = await db.select().from(campaignSteps).where(and(eq(campaignSteps.campaignId, enr.campaignId), eq(campaignSteps.order, enr.currentStep)))
    if (!step) {
      // No step at this index — campaign is done for this enrollment.
      await db.update(campaignEnrollments).set({ status: 'completed' }).where(eq(campaignEnrollments.id, enr.id))
      continue
    }
    // Template was deleted between step creation and worker tick — mark the
    // enrollment 'stopped' so the user notices, instead of silently looping.
    if (!step.templateId) {
      await db.update(campaignEnrollments).set({ status: 'stopped' }).where(eq(campaignEnrollments.id, enr.id))
      continue
    }
    const [tpl] = await db.select().from(templates).where(eq(templates.id, step.templateId))
    if (!tpl) {
      await db.update(campaignEnrollments).set({ status: 'stopped' }).where(eq(campaignEnrollments.id, enr.id))
      continue
    }
    const email = buildEmail(tpl, contact)
    try {
      // Create an email_log row to thread the tracking pixel/clicks through.
      const inserted = await db.insert(emailLog).values({
        userId, contactId: contact.id,
        scheduleId: `camp_${enr.campaignId}_${enr.id}_${enr.currentStep}`,
        email: contact.recruiterEmail, subject: email.subject, body: email.html,
        scheduledAt: now, status: 'Sent', attempts: 1,
        lastResult: new Date().toLocaleString(),
      }).returning({ id: emailLog.id })
      const logId = inserted[0]!.id
      await sendMail({ ...email, html: instrumentHtml(email.html, logId) })
      await db.insert(events).values({
        userId, contactId: contact.id, templateId: tpl.id, kind: 'sent',
        meta: JSON.stringify({ step: enr.currentStep, campaignId: enr.campaignId, emailLogId: logId }),
      })
      await db.update(campaignEnrollments).set({
        currentStep: enr.currentStep + 1,
        nextRunAt: now + step.delayHours * 60 * 60 * 1000,
      }).where(eq(campaignEnrollments.id, enr.id))
    } catch (err) {
      console.error('[worker] enrollment send failed', enr.id, err)
    }
  }
}

async function tick() {
  const allUsers = await db.select({ id: users.id }).from(users)
  for (const u of allUsers) {
    try { await tickForUser(u.id) }
    catch (err) { console.error('[worker] user tick failed', u.id, err) }
  }
}

async function main() {
  console.log('[worker] scheduler started, tick every', TICK_MS, 'ms')
  // Run once on boot, then every TICK_MS.
  await tick().catch((e) => console.error('[worker] initial tick', e))
  setInterval(() => { tick().catch((e) => console.error('[worker] tick', e)) }, TICK_MS)
}

main()
