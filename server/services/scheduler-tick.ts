// One-pass scheduler tick. Used by BOTH workers/scheduler.ts (long-running
// process) and app/api/cron/tick/route.ts (Vercel cron). Keeping a single
// implementation prevents drift between the two surfaces.
import { and, eq, sql, lte } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  emailLog, events, campaignEnrollments, campaignSteps, campaigns, contacts, settings, templates, users,
} from '@/server/db/schema'
import { lastSentTo } from './drafts'
import { buildEmail } from './drafts'
import { sendMail } from './mailer'
import { instrumentHtml } from './tracking'
import { isBlocked } from './blocklist'
import { maybePurgeForUser } from './retention'
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
  // Recover any rows stuck in 'Sending' for >10 min — that means the
  // previous tick that claimed them crashed before flipping the status.
  // Reverting to 'Scheduled' lets the next tick retry. Without this,
  // crashed sends would sit forever and the user would notice missing
  // emails. The 10-minute window is well past any reasonable SMTP attempt.
  const stuckCutoff = now - 10 * 60_000
  await db.update(emailLog).set({ status: 'Scheduled', lastResult: 'Recovered from stuck Sending state' })
    .where(and(
      eq(emailLog.userId, userId),
      eq(emailLog.status, 'Sending'),
      lte(emailLog.scheduledAt, stuckCutoff),
    ))
  // Rolling 24-hour window — timezone-agnostic, avoids the UTC-vs-user-TZ
  // mismatch that setHours(0,0,0,0) causes on cloud servers running UTC.
  const dayAgo = now - 24 * 60 * 60_000
  const sentToday = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
    .where(and(eq(events.userId, userId), eq(events.kind, 'sent'), sql`${events.ts} >= ${dayAgo}`))
  // Per-user daily-limit override — admins can raise/lower an individual
  // user's quota via /admin/users without touching env. Falls back to env.
  const overrideRow = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'DAILY_SEND_LIMIT_OVERRIDE')))
  const override = Number(overrideRow[0]?.value ?? 0)
  const effectiveLimit = Number.isFinite(override) && override > 0 ? Math.floor(override) : DAILY_LIMIT
  const remaining = Math.max(0, effectiveLimit - Number(sentToday[0]?.n ?? 0))
  let sent = 0, failed = 0, advanced = 0
  if (remaining <= 0) return { sent, failed, advanced }

  // Read per-recipient throttle setting once per user-tick. 0 = disabled.
  // Setting is a string number of days; we treat anything <= 0 as disabled.
  const throttleRow = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'PER_RECIPIENT_THROTTLE_DAYS')))
  const throttleDays = Math.max(0, Number(throttleRow[0]?.value ?? 0))

  // Per-domain rate-limit. Format: "domain=N,domain=N" e.g. "gmail.com=50,outlook.com=30".
  // Counts events.kind='sent' in the last 24h for each recipient domain,
  // and skips queued rows whose recipient domain has hit its cap.
  const domainCapRow = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'PER_DOMAIN_DAILY_CAP')))
  const domainCaps = parseDomainCaps(domainCapRow[0]?.value ?? '')
  // Pull "today's" send counts per domain — cheap query, single pass in JS.
  const domainSentToday = new Map<string, number>()
  if (domainCaps.size > 0) {
    const sentRows = await db.select({ email: emailLog.email }).from(emailLog)
      .where(and(
        eq(emailLog.userId, userId),
        eq(emailLog.status, 'Sent'),
        sql`${emailLog.scheduledAt} >= ${dayAgo}`,
      ))
    for (const r of sentRows) {
      const d = (r.email.split('@')[1] ?? '').toLowerCase()
      if (d) domainSentToday.set(d, (domainSentToday.get(d) ?? 0) + 1)
    }
  }

  // 1) Scheduled emails — send any whose time has come (5-min tolerance).
  // Two-step claim to prevent double-send across overlapping ticks (Vercel
  // cron can retry, and the long-running worker can fire concurrently if a
  // tick takes > tickInterval). For each candidate id, do an atomic UPDATE
  // that flips Scheduled → Sending; only proceed if the update affected
  // exactly that row. A second tick will see status='Sending' and skip.
  const candidates = await db.select({ id: emailLog.id }).from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.status, 'Scheduled'), lte(emailLog.scheduledAt, now + 5 * 60_000)))
    .limit(Math.min(BATCH_PER_USER, remaining))
  const due: typeof emailLog.$inferSelect[] = []
  for (const c of candidates) {
    // Drizzle returns nothing useful for affected-row count across drivers,
    // so we do a select-then-conditional-update + re-select to confirm we
    // own the row. WHERE id=? AND status='Scheduled' makes the update
    // idempotent — only one tick can win the transition to 'Sending'.
    await db.update(emailLog).set({ status: 'Sending' })
      .where(and(eq(emailLog.id, c.id), eq(emailLog.status, 'Scheduled')))
    const [claimed] = await db.select().from(emailLog).where(eq(emailLog.id, c.id))
    if (claimed && claimed.status === 'Sending') due.push(claimed)
  }
  for (const row of due) {
    try {
      if (!row.body) {
        await db.update(emailLog).set({ status: 'Failed', lastResult: 'Empty body' }).where(eq(emailLog.id, row.id))
        failed++; continue
      }
      // Per-recipient throttle. If the user has set "max 1 per N days" and
      // this recipient was already sent to within that window, mark this
      // queued row Cancelled with a clear reason. Prevents accidental
      // re-sends from overlapping campaigns / follow-ups.
      if (throttleDays > 0) {
        const last = await lastSentTo(userId, row.email, throttleDays)
        if (last) {
          await db.update(emailLog).set({
            status: 'Cancelled',
            lastResult: `Throttled: already sent within ${throttleDays}d on ${formatDate(last)}`,
          }).where(eq(emailLog.id, row.id))
          continue
        }
      }
      // Per-domain daily cap. If the recipient's domain has a configured
      // cap and we've already hit it today, defer (leave Scheduled, push
      // by 1h). Logic differs from throttle: throttle Cancels; cap defers
      // so it eventually sends on a less-busy day.
      const recipientDomain = (row.email.split('@')[1] ?? '').toLowerCase()
      const cap = domainCaps.get(recipientDomain)
      if (cap !== undefined && (domainSentToday.get(recipientDomain) ?? 0) >= cap) {
        await db.update(emailLog).set({
          scheduledAt: now + 60 * 60_000,
          lastResult: `Deferred 1h: daily cap of ${cap} hit for @${recipientDomain}`,
        }).where(eq(emailLog.id, row.id))
        continue
      }
      await sendMail({ to: row.email, subject: row.subject, html: instrumentHtml(row.body, row.id) }, userId)
      await db.update(emailLog).set({
        status: 'Sent', attempts: row.attempts + 1, lastResult: formatDate(new Date()),
      }).where(eq(emailLog.id, row.id))
      await db.insert(events).values({
        userId, contactId: row.contactId ?? null, kind: 'sent',
        meta: JSON.stringify({ subject: row.subject, emailLogId: row.id }),
      })
      // Bump the in-memory counter so subsequent rows in this batch
      // respect the freshly-incremented count.
      if (cap !== undefined) domainSentToday.set(recipientDomain, (domainSentToday.get(recipientDomain) ?? 0) + 1)
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
  // Apply the same daily-limit budget used in section 1 (accounting for
  // emails already sent in this tick), and join through campaigns so the
  // LIMIT applies per-user rather than globally first-come-first-served.
  const campaignRemaining = Math.max(0, remaining - sent)
  if (campaignRemaining > 0) {
    const enrolled = await db.select({
      id: campaignEnrollments.id,
      campaignId: campaignEnrollments.campaignId,
      contactId: campaignEnrollments.contactId,
      currentStep: campaignEnrollments.currentStep,
      nextRunAt: campaignEnrollments.nextRunAt,
      status: campaignEnrollments.status,
    }).from(campaignEnrollments)
      .innerJoin(campaigns, and(
        eq(campaigns.id, campaignEnrollments.campaignId),
        eq(campaigns.userId, userId),
      ))
      .where(and(eq(campaignEnrollments.status, 'active'), lte(campaignEnrollments.nextRunAt, now)))
      .limit(Math.min(BATCH_PER_USER, campaignRemaining))

    for (const enr of enrolled) {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, enr.contactId))
      if (!contact) continue
      const [step] = await db.select().from(campaignSteps)
        .where(and(eq(campaignSteps.campaignId, enr.campaignId), eq(campaignSteps.order, enr.currentStep)))
      if (!step) {
        await db.update(campaignEnrollments).set({ status: 'completed' }).where(eq(campaignEnrollments.id, enr.id))
        continue
      }
      // stopOnReply — stop before sending if the contact has already replied
      // and the step is configured to halt the sequence on reply.
      if (step.stopOnReply && contact.emailStatus.startsWith('Replied')) {
        await db.update(campaignEnrollments).set({ status: 'replied' }).where(eq(campaignEnrollments.id, enr.id))
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
      // Blocklist — respect per-user and global blocks for campaign sends.
      if (await isBlocked(userId, contact.recruiterEmail)) {
        await db.update(campaignEnrollments).set({ status: 'stopped' }).where(eq(campaignEnrollments.id, enr.id))
        continue
      }
      // Per-recipient throttle — defer enrollment if already emailed recently.
      if (throttleDays > 0) {
        const last = await lastSentTo(userId, contact.recruiterEmail, throttleDays)
        if (last) {
          await db.update(campaignEnrollments).set({ nextRunAt: now + throttleDays * 24 * 60 * 60_000 })
            .where(eq(campaignEnrollments.id, enr.id))
          continue
        }
      }
      // Per-domain cap — defer 1h if the domain's daily quota is exhausted.
      const recipientDomain = (contact.recruiterEmail.split('@')[1] ?? '').toLowerCase()
      const cap = domainCaps.get(recipientDomain)
      if (cap !== undefined && (domainSentToday.get(recipientDomain) ?? 0) >= cap) {
        await db.update(campaignEnrollments).set({ nextRunAt: now + 60 * 60_000 })
          .where(eq(campaignEnrollments.id, enr.id))
        continue
      }
      const email = buildEmail(tpl, contact)
      // Insert the log row as 'Sending' so a crash between insert and
      // sendMail doesn't leave a phantom 'Sent' record. The stuck-Sending
      // recovery at the top of tickForUser will clean it up if needed.
      let logId: number | undefined
      try {
        const inserted = await db.insert(emailLog).values({
          userId, contactId: contact.id,
          scheduleId: `camp_${enr.campaignId}_${enr.id}_${enr.currentStep}`,
          email: contact.recruiterEmail, subject: email.subject, body: email.html,
          scheduledAt: now, status: 'Sending', attempts: 1, lastResult: '',
        }).returning({ id: emailLog.id })
        logId = inserted[0]!.id
        await sendMail({ ...email, html: instrumentHtml(email.html, logId) }, userId)
        await db.update(emailLog).set({ status: 'Sent', lastResult: formatDate(new Date()) })
          .where(eq(emailLog.id, logId))
        await db.insert(events).values({
          userId, contactId: contact.id, templateId: tpl.id, kind: 'sent',
          meta: JSON.stringify({ step: enr.currentStep, campaignId: enr.campaignId, emailLogId: logId }),
        })
        await db.update(campaignEnrollments).set({
          currentStep: enr.currentStep + 1,
          nextRunAt: now + step.delayHours * 60 * 60 * 1000,
        }).where(eq(campaignEnrollments.id, enr.id))
        if (cap !== undefined) domainSentToday.set(recipientDomain, (domainSentToday.get(recipientDomain) ?? 0) + 1)
        advanced++
      } catch (err) {
        log.error({ err, enrollmentId: enr.id, campaignId: enr.campaignId }, 'enrollment send failed')
        if (logId !== undefined) {
          await db.update(emailLog).set({
            status: 'Failed',
            lastResult: 'FAILED: ' + (err instanceof Error ? err.message : String(err)),
          }).where(eq(emailLog.id, logId)).catch(() => {})
        }
        failed++
      }
    }
  }

  return { sent, failed, advanced }
}

/**
 * Parse a per-domain cap string into a Map. Input format is
 * "domain=N, domain=N, …" (commas, semicolons, or newlines all work).
 * Domain is lowercased; non-numeric caps are skipped. Empty → empty map.
 */
function parseDomainCaps(raw: string): Map<string, number> {
  const out = new Map<string, number>()
  if (!raw) return out
  for (const pair of raw.split(/[,;\n]/)) {
    const [d, n] = pair.split('=').map((s) => s.trim())
    if (!d || !n) continue
    const cap = Number(n)
    if (!Number.isFinite(cap) || cap <= 0) continue
    out.set(d.toLowerCase(), Math.floor(cap))
  }
  return out
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
    // Daily retention purge — internal gate keeps it at ~once per 24h
    // per user. Non-fatal: if the purge errors, the user tick still ran.
    await maybePurgeForUser(u.id).catch((err) => log.error({ err, userId: u.id }, 'retention skipped'))
  }
  return { sent, failed, advanced, users: allUsers.length }
}
