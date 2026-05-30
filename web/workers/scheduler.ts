import fs from 'node:fs'
import path from 'node:path'
import { and, eq, lte, sql } from 'drizzle-orm'

// Minimal .env loader — same shape as scripts/migrate.ts so the worker can
// run as a plain `tsx workers/scheduler.ts` without a dotenv dependency.
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadDotEnv(path.join(process.cwd(), '.env'))
import { db } from '../server/db/client'
import { campaignEnrollments, campaignSteps, contacts, emailLog, events, templates, users } from '../server/db/schema'
import { buildEmail } from '../server/services/drafts'
import { sendMail } from '../server/services/mailer'
import { env } from '../lib/env'

const TICK_MS = 30_000
const BATCH_PER_USER = 10

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
  const remaining = Math.max(0, env.DAILY_SEND_LIMIT - Number(sentTodayRows[0]?.n ?? 0))
  if (remaining <= 0) return

  // 1. Send any scheduled email_log rows whose time has come.
  const due = await db.select().from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.status, 'Scheduled'), lte(emailLog.scheduledAt, now + 5 * 60_000)))
    .limit(Math.min(BATCH_PER_USER, remaining))
  for (const row of due) {
    try {
      await sendMail({ to: row.email, subject: row.subject, html: row.body || row.subject })
      await db.update(emailLog).set({ status: 'Sent', attempts: row.attempts + 1, lastResult: new Date().toLocaleString() })
        .where(eq(emailLog.id, row.id))
      await db.insert(events).values({ userId, contactId: row.contactId ?? null, kind: 'sent', meta: JSON.stringify({ subject: row.subject }) })
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
      await db.update(campaignEnrollments).set({ status: 'completed' }).where(eq(campaignEnrollments.id, enr.id))
      continue
    }
    if (!step.templateId) continue
    const [tpl] = await db.select().from(templates).where(eq(templates.id, step.templateId))
    if (!tpl) continue
    const email = buildEmail(tpl, contact)
    try {
      await sendMail(email)
      await db.insert(events).values({ userId, contactId: contact.id, templateId: tpl.id, kind: 'sent', meta: JSON.stringify({ step: enr.currentStep }) })
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
