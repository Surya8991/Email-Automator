// One-pass scheduler tick. Used by BOTH workers/scheduler.ts (long-running
// process) and app/api/cron/tick/route.ts (Vercel cron). Keeping a single
// implementation prevents drift between the two surfaces.
import { and, eq, sql, lte } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  emailLog, events, campaignEnrollments, campaignSteps, contacts, settings, templates, users,
} from '@/server/db/schema'
import { buildEmail } from './drafts'
import { sendMail } from './mailer'
import { instrumentHtml } from './tracking'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { formatDate } from '@/lib/utils'

const log = logger.child({ component: 'scheduler-tick' })

const BATCH_PER_USER = 10
const DAILY_LIMIT =
  Number.isInteger(env.DAILY_SEND_LIMIT) && env.DAILY_SEND_LIMIT > 0
    ? env.DAILY_SEND_LIMIT
    : 50

function backoffMs(attempt: number): number {
  const base = 60_000
  const raw = base * Math.pow(2, Math.max(0, attempt - 1))
  const capped = Math.min(raw, 30 * 60 * 1000)
  const jitter = capped * 0.25 * (Math.random() * 2 - 1)
  return Math.max(1000, Math.floor(capped + jitter))
}

export interface TickStats { sent: number; failed: number; advanced: number; users: number }

async function tickForUser(userId: string): Promise<{ sent: number; failed: number; advanced: number }> {
  const now = Date.now()
  // Emergency kill-switch — if the user flipped Settings → Pause sends,
  // skip the whole tick for them. Their scheduled rows just wait.
  const pausedRow = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'SENDS_PAUSED')))
  if (pausedRow[0]?.value === 'true') {
    log.debug({ userId }, 'sends paused by user setting — skip tick')
    return { sent: 0, failed: 0, advanced: 0 }
  }
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const sentToday = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
    .where(and(eq(events.userId, userId), eq(events.kind, 'sent'), sql`${events.ts} >= ${startOfDay.getTime()}`))
  const remaining = Math.max(0, DAILY_LIMIT - Number(sentToday[0]?.n ?? 0))
  let sent = 0, failed = 0, advanced = 0
  if (remaining <= 0) return { sent, failed, advanced }

  // 1) Scheduled emails — send any whose time has come (5-min tolerance).
  const due = await db.select().from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.status, 'Scheduled'), lte(emailLog.scheduledAt, now + 5 * 60_000)))
    .limit(Math.min(BATCH_PER_USER, remaining))
  for (const row of due) {
    try {
      if (!row.body) {
        await db.update(emailLog).set({ status: 'Failed', lastResult: 'Empty body' }).where(eq(emailLog.id, row.id))
        failed++; continue
      }
      await sendMail({ to: row.email, subject: row.subject, html: instrumentHtml(row.body, row.id) }, userId)
      await db.update(emailLog).set({
        status: 'Sent', attempts: row.attempts + 1, lastResult: formatDate(new Date()),
      }).where(eq(emailLog.id, row.id))
      await db.insert(events).values({
        userId, contactId: row.contactId ?? null, kind: 'sent',
        meta: JSON.stringify({ subject: row.subject, emailLogId: row.id }),
      })
      sent++
    } catch (err) {
      const attempts = row.attempts + 1
      const isFinal = attempts >= 3
      await db.update(emailLog).set({
        status: isFinal ? 'Failed' : 'Retrying',
        attempts,
        scheduledAt: isFinal ? row.scheduledAt : now + backoffMs(attempts),
        lastResult: (isFinal ? 'FAILED: ' : 'Retry: ') + (err instanceof Error ? err.message : String(err)),
      }).where(eq(emailLog.id, row.id))
      if (isFinal) failed++
    }
  }

  // 2) Campaign enrollments — advance any whose nextRunAt has passed.
  const enrolled = await db.select().from(campaignEnrollments)
    .where(and(eq(campaignEnrollments.status, 'active'), lte(campaignEnrollments.nextRunAt, now)))
    .limit(BATCH_PER_USER)
  for (const enr of enrolled) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, enr.contactId))
    if (!contact || contact.userId !== userId) continue
    const [step] = await db.select().from(campaignSteps)
      .where(and(eq(campaignSteps.campaignId, enr.campaignId), eq(campaignSteps.order, enr.currentStep)))
    if (!step) {
      await db.update(campaignEnrollments).set({ status: 'completed' }).where(eq(campaignEnrollments.id, enr.id))
      continue
    }
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
      const inserted = await db.insert(emailLog).values({
        userId, contactId: contact.id,
        scheduleId: `camp_${enr.campaignId}_${enr.id}_${enr.currentStep}`,
        email: contact.recruiterEmail, subject: email.subject, body: email.html,
        scheduledAt: now, status: 'Sent', attempts: 1,
        lastResult: formatDate(new Date()),
      }).returning({ id: emailLog.id })
      const logId = inserted[0]!.id
      await sendMail({ ...email, html: instrumentHtml(email.html, logId) }, userId)
      await db.insert(events).values({
        userId, contactId: contact.id, templateId: tpl.id, kind: 'sent',
        meta: JSON.stringify({ step: enr.currentStep, campaignId: enr.campaignId, emailLogId: logId }),
      })
      await db.update(campaignEnrollments).set({
        currentStep: enr.currentStep + 1,
        nextRunAt: now + step.delayHours * 60 * 60 * 1000,
      }).where(eq(campaignEnrollments.id, enr.id))
      advanced++
    } catch (err) {
      log.error({ err, enrollmentId: enr.id, campaignId: enr.campaignId }, 'enrollment send failed')
      failed++
    }
  }

  return { sent, failed, advanced }
}

export async function tickOnce(): Promise<TickStats> {
  const allUsers = await db.select({ id: users.id }).from(users)
  let sent = 0, failed = 0, advanced = 0
  for (const u of allUsers) {
    try {
      const r = await tickForUser(u.id)
      sent += r.sent; failed += r.failed; advanced += r.advanced
    } catch (err) {
      log.error({ err, userId: u.id }, 'user tick failed')
    }
  }
  return { sent, failed, advanced, users: allUsers.length }
}
