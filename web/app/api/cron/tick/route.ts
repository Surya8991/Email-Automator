import { NextResponse } from 'next/server'
import { eq, sql, and, lte } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { emailLog, events, campaignEnrollments, campaignSteps, contacts, templates, users } from '@/server/db/schema'
import { buildEmail } from '@/server/services/drafts'
import { sendMail } from '@/server/services/mailer'
import { instrumentHtml } from '@/server/services/tracking'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// One-shot version of the worker for serverless cron (Vercel: */1 * * * *).
// Same logic as workers/scheduler.ts but exits after one pass.
// Protected by CRON_SECRET — Vercel sets the Authorization header automatically
// when configured; for self-hosted, pass `?secret=...` from your own cron.

function backoffMs(attempt: number): number {
  const base = 60_000
  const raw = base * Math.pow(2, Math.max(0, attempt - 1))
  const capped = Math.min(raw, 30 * 60 * 1000)
  const jitter = capped * 0.25 * (Math.random() * 2 - 1)
  return Math.max(1000, Math.floor(capped + jitter))
}

async function unauthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // no secret configured → open (don't enable cron without one in prod)
  const url = new URL(req.url)
  if (url.searchParams.get('secret') === secret) return false
  const h = req.headers.get('authorization') || ''
  if (h === `Bearer ${secret}`) return false
  return true
}

export async function GET(req: Request) {
  if (await unauthorized(req)) return new NextResponse('Unauthorized', { status: 401 })

  const start = Date.now()
  const allUsers = await db.select({ id: users.id }).from(users)
  let sent = 0, advanced = 0, failed = 0

  for (const u of allUsers) {
    const now = Date.now()
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const sentToday = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
      .where(and(eq(events.userId, u.id), eq(events.kind, 'sent'), sql`${events.ts} >= ${startOfDay.getTime()}`))
    const remaining = Math.max(0, env.DAILY_SEND_LIMIT - Number(sentToday[0]?.n ?? 0))
    if (remaining <= 0) continue

    // Scheduled emails
    const due = await db.select().from(emailLog)
      .where(and(eq(emailLog.userId, u.id), eq(emailLog.status, 'Scheduled'), lte(emailLog.scheduledAt, now + 5 * 60_000)))
      .limit(Math.min(10, remaining))
    for (const row of due) {
      try {
        if (!row.body) {
          await db.update(emailLog).set({ status: 'Failed', lastResult: 'Empty body' }).where(eq(emailLog.id, row.id))
          continue
        }
        await sendMail({ to: row.email, subject: row.subject, html: instrumentHtml(row.body, row.id) })
        await db.update(emailLog).set({ status: 'Sent', attempts: row.attempts + 1, lastResult: new Date().toLocaleString() }).where(eq(emailLog.id, row.id))
        await db.insert(events).values({ userId: u.id, contactId: row.contactId ?? null, kind: 'sent', meta: JSON.stringify({ subject: row.subject, emailLogId: row.id }) })
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

    // Campaign enrollments
    const enrolled = await db.select().from(campaignEnrollments)
      .where(and(eq(campaignEnrollments.status, 'active'), lte(campaignEnrollments.nextRunAt, now)))
      .limit(10)
    for (const enr of enrolled) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, enr.contactId))
      if (!c || c.userId !== u.id) continue
      const [step] = await db.select().from(campaignSteps).where(and(eq(campaignSteps.campaignId, enr.campaignId), eq(campaignSteps.order, enr.currentStep)))
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
      const email = buildEmail(tpl, c)
      try {
        const inserted = await db.insert(emailLog).values({
          userId: u.id, contactId: c.id,
          scheduleId: `camp_${enr.campaignId}_${enr.id}_${enr.currentStep}`,
          email: c.recruiterEmail, subject: email.subject, body: email.html,
          scheduledAt: now, status: 'Sent', attempts: 1,
          lastResult: new Date().toLocaleString(),
        }).returning({ id: emailLog.id })
        const logId = inserted[0]!.id
        await sendMail({ ...email, html: instrumentHtml(email.html, logId) })
        await db.insert(events).values({
          userId: u.id, contactId: c.id, templateId: tpl.id, kind: 'sent',
          meta: JSON.stringify({ step: enr.currentStep, campaignId: enr.campaignId, emailLogId: logId }),
        })
        await db.update(campaignEnrollments).set({
          currentStep: enr.currentStep + 1,
          nextRunAt: now + step.delayHours * 60 * 60 * 1000,
        }).where(eq(campaignEnrollments.id, enr.id))
        advanced++
      } catch (err) {
        failed++
      }
    }
  }

  return NextResponse.json({ ok: true, sent, advanced, failed, ms: Date.now() - start })
}
