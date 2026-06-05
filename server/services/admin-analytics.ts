// Admin-only analytics & operational data. Every function here returns
// cross-user data and MUST only be called from a requireAdmin()-gated
// surface (server actions, pages, or routes). No userId scoping is applied.
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/server/db/client'
import {
  emailLog, events, users, webhooks, settings, auditLog, blocklist,
  campaigns, campaignEnrollments, contacts, drafts, templates,
} from '@/server/db/schema'
import { env } from '@/lib/env'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── A1: Email Queue Health ──────────────────────────────────────────
export async function queueHealth() {
  const now = Date.now()
  const since24h = now - DAY_MS
  const [scheduled, sending, retrying, failed24h, sent24h, cancelled24h] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(eq(emailLog.status, 'Scheduled')),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(eq(emailLog.status, 'Sending')),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(eq(emailLog.status, 'Retrying')),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog)
      .where(and(eq(emailLog.status, 'Failed'), gte(emailLog.scheduledAt, since24h))),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog)
      .where(and(eq(emailLog.status, 'Sent'), gte(emailLog.scheduledAt, since24h))),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog)
      .where(and(eq(emailLog.status, 'Cancelled'), gte(emailLog.scheduledAt, since24h))),
  ])
  const stuck = await db.select({ n: sql<number>`COUNT(*)` }).from(emailLog)
    .where(and(eq(emailLog.status, 'Sending'), lt(emailLog.scheduledAt, now - 10 * 60_000)))
  return {
    scheduled: Number(scheduled[0]?.n ?? 0),
    sending: Number(sending[0]?.n ?? 0),
    retrying: Number(retrying[0]?.n ?? 0),
    failed24h: Number(failed24h[0]?.n ?? 0),
    sent24h: Number(sent24h[0]?.n ?? 0),
    cancelled24h: Number(cancelled24h[0]?.n ?? 0),
    stuck: Number(stuck[0]?.n ?? 0),
  }
}

// ─── A2: Recent Failures ─────────────────────────────────────────────
export async function recentFailures(limit = 20) {
  const rows = await db.select({
    id: emailLog.id,
    userEmail: users.email,
    recipient: emailLog.email,
    subject: emailLog.subject,
    attempts: emailLog.attempts,
    lastResult: emailLog.lastResult,
    scheduledAt: emailLog.scheduledAt,
  }).from(emailLog)
    .leftJoin(users, eq(emailLog.userId, users.id))
    .where(eq(emailLog.status, 'Failed'))
    .orderBy(desc(emailLog.scheduledAt))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    userEmail: r.userEmail ?? '—',
    scheduledAt: new Date(r.scheduledAt).toISOString(),
  }))
}

// ─── A3: Active Send Queue ───────────────────────────────────────────
export async function activeSendQueue(limit = 25) {
  const rows = await db.select({
    id: emailLog.id,
    userEmail: users.email,
    recipient: emailLog.email,
    subject: emailLog.subject,
    status: emailLog.status,
    scheduledAt: emailLog.scheduledAt,
  }).from(emailLog)
    .leftJoin(users, eq(emailLog.userId, users.id))
    .where(inArray(emailLog.status, ['Scheduled', 'Retrying', 'Sending']))
    .orderBy(asc(emailLog.scheduledAt))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    userEmail: r.userEmail ?? '—',
    scheduledAt: new Date(r.scheduledAt).toISOString(),
  }))
}

// ─── A4: Webhook Delivery Health ─────────────────────────────────────
export async function webhookHealth() {
  const rows = await db.select({
    id: webhooks.id,
    userEmail: users.email,
    url: webhooks.url,
    events: webhooks.events,
    lastStatus: webhooks.lastStatus,
    lastDeliveryAt: webhooks.lastDeliveryAt,
    lastError: webhooks.lastError,
  }).from(webhooks)
    .leftJoin(users, eq(webhooks.userId, users.id))
    .orderBy(desc(webhooks.lastDeliveryAt))
  return rows.map((r) => ({
    ...r,
    userEmail: r.userEmail ?? '—',
    lastDeliveryAt: r.lastDeliveryAt ? r.lastDeliveryAt.toISOString() : null,
  }))
}

// ─── A5: Per-user drill-down ─────────────────────────────────────────
export async function userDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return null
  const since30 = Date.now() - 30 * DAY_MS
  const [contactsN, draftsN, sent30, opens30, clicks30, replies30, bounces30, queued, activeCampaigns, lastSentEv, throttle, domainCap, quotaOverride, paused] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, userId)),
    db.select({ n: sql<number>`COUNT(*)` }).from(drafts).where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft'))),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'sent'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'open'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'click'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'reply'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'bounce'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(and(eq(emailLog.userId, userId), inArray(emailLog.status, ['Scheduled', 'Retrying', 'Sending']))),
    db.select({ n: sql<number>`COUNT(*)` }).from(campaigns).where(and(eq(campaigns.userId, userId), eq(campaigns.status, 'active'))),
    db.select({ ts: events.ts }).from(events).where(and(eq(events.userId, userId), eq(events.kind, 'sent'))).orderBy(desc(events.ts)).limit(1),
    db.select({ v: settings.value }).from(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'PER_RECIPIENT_THROTTLE_DAYS'))),
    db.select({ v: settings.value }).from(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'PER_DOMAIN_DAILY_CAP'))),
    db.select({ v: settings.value }).from(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'DAILY_SEND_LIMIT_OVERRIDE'))),
    db.select({ v: settings.value }).from(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'SENDS_PAUSED'))),
  ])
  // Last 10 sends
  const recentSends = await db.select({
    id: emailLog.id,
    recipient: emailLog.email,
    subject: emailLog.subject,
    status: emailLog.status,
    scheduledAt: emailLog.scheduledAt,
    lastResult: emailLog.lastResult,
  }).from(emailLog)
    .where(eq(emailLog.userId, userId))
    .orderBy(desc(emailLog.scheduledAt))
    .limit(10)
  return {
    user: {
      id: user.id, email: user.email, name: user.name ?? '',
      createdAt: user.createdAt.toISOString(),
    },
    counts: {
      contacts: Number(contactsN[0]?.n ?? 0),
      draftsPending: Number(draftsN[0]?.n ?? 0),
      sent30: Number(sent30[0]?.n ?? 0),
      opens30: Number(opens30[0]?.n ?? 0),
      clicks30: Number(clicks30[0]?.n ?? 0),
      replies30: Number(replies30[0]?.n ?? 0),
      bounces30: Number(bounces30[0]?.n ?? 0),
      queued: Number(queued[0]?.n ?? 0),
      activeCampaigns: Number(activeCampaigns[0]?.n ?? 0),
    },
    settings: {
      paused: paused[0]?.v === 'true',
      throttleDays: Number(throttle[0]?.v ?? 0),
      domainCap: domainCap[0]?.v ?? '',
      dailyLimitOverride: quotaOverride[0]?.v ?? '',
    },
    lastSentAt: lastSentEv[0]?.ts ? new Date(lastSentEv[0].ts).toISOString() : null,
    recentSends: recentSends.map((r) => ({ ...r, scheduledAt: new Date(r.scheduledAt).toISOString() })),
  }
}

// ─── A9: DB size + table row counts ──────────────────────────────────
export async function dbHealth() {
  const dbUrl = process.env.DATABASE_URL ?? './data/tracker.db'
  let fileSize: number | null = null
  let driver: 'sqlite' | 'libsql' = 'sqlite'
  if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')) {
    driver = 'libsql'
  } else {
    try {
      const dbPath = path.isAbsolute(dbUrl) ? dbUrl : path.join(process.cwd(), dbUrl)
      if (fs.existsSync(dbPath)) fileSize = fs.statSync(dbPath).size
    } catch { /* ignore */ }
  }
  const tables = [
    { name: 'users', table: users },
    { name: 'contacts', table: contacts },
    { name: 'templates', table: templates },
    { name: 'drafts', table: drafts },
    { name: 'email_log', table: emailLog },
    { name: 'events', table: events },
    { name: 'campaigns', table: campaigns },
    { name: 'campaign_enrollments', table: campaignEnrollments },
    { name: 'webhooks', table: webhooks },
    { name: 'audit_log', table: auditLog },
    { name: 'blocklist', table: blocklist },
    { name: 'settings', table: settings },
  ] as const
  const counts = await Promise.all(
    tables.map(async ({ name, table }) => {
      const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(table)
      return { name, n: Number(row?.n ?? 0) }
    }),
  )
  // Events growth rate — count last 7d vs prior 7d.
  const now = Date.now()
  const [last7] = await db.select({ n: sql<number>`COUNT(*)` }).from(events).where(gte(events.ts, now - 7 * DAY_MS))
  const [prev7] = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
    .where(and(gte(events.ts, now - 14 * DAY_MS), lt(events.ts, now - 7 * DAY_MS)))
  return {
    driver, fileSize, tables: counts,
    eventsGrowth: { last7: Number(last7?.n ?? 0), prev7: Number(prev7?.n ?? 0) },
  }
}

// ─── A10: Quota usage (who's near the limit today) ───────────────────
export async function quotaUsage() {
  const since = Date.now() - DAY_MS
  const sent24Rows = await db.select({
    uid: events.userId, n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.kind, 'sent'), gte(events.ts, since)))
    .groupBy(events.userId)
  // Pull users + override settings in one go.
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users)
  const overrides = await db.select({ uid: settings.userId, v: settings.value })
    .from(settings).where(eq(settings.key, 'DAILY_SEND_LIMIT_OVERRIDE'))
  const overrideMap = new Map(overrides.map((r) => [r.uid, Number(r.v) || null]))
  const sentMap = new Map(sent24Rows.map((r) => [r.uid, Number(r.n)]))
  const defaultLimit = env.DAILY_SEND_LIMIT
  return allUsers.map((u) => {
    const sent = sentMap.get(u.id) ?? 0
    const limit = overrideMap.get(u.id) ?? defaultLimit
    return {
      userId: u.id, email: u.email ?? '—',
      sent, limit,
      pct: limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0,
    }
  }).filter((r) => r.sent > 0).sort((a, b) => b.pct - a.pct)
}

// ─── A11: Global blocklist (null userId entries) ─────────────────────
export async function listGlobalBlocklist() {
  return db.select().from(blocklist).where(sql`${blocklist.userId} IS NULL`).orderBy(desc(blocklist.id))
}

// ─── A12: Campaign health overview ───────────────────────────────────
export async function campaignHealth() {
  const rows = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    status: campaigns.status,
    userEmail: users.email,
    createdAt: campaigns.createdAt,
  }).from(campaigns)
    .leftJoin(users, eq(campaigns.userId, users.id))
    .where(ne(campaigns.status, 'archived'))
    .orderBy(desc(campaigns.createdAt))
  if (rows.length === 0) return []
  // Enrollment counts per campaign
  const ids = rows.map((r) => r.id)
  const enrolls = await db.select({
    cid: campaignEnrollments.campaignId,
    status: campaignEnrollments.status,
    n: sql<number>`COUNT(*)`,
  }).from(campaignEnrollments)
    .where(inArray(campaignEnrollments.campaignId, ids))
    .groupBy(campaignEnrollments.campaignId, campaignEnrollments.status)
  const byId = new Map<number, { active: number; completed: number; replied: number; stopped: number }>()
  for (const e of enrolls) {
    const cur = byId.get(e.cid) ?? { active: 0, completed: 0, replied: 0, stopped: 0 }
    const n = Number(e.n)
    if (e.status === 'active') cur.active = n
    else if (e.status === 'completed') cur.completed = n
    else if (e.status === 'replied') cur.replied = n
    else if (e.status === 'stopped') cur.stopped = n
    byId.set(e.cid, cur)
  }
  return rows.map((r) => ({
    ...r,
    userEmail: r.userEmail ?? '—',
    createdAt: r.createdAt.toISOString(),
    enrollment: byId.get(r.id) ?? { active: 0, completed: 0, replied: 0, stopped: 0 },
  }))
}

// ─── A13: Cross-user 30-day send series ──────────────────────────────
export async function crossUserDailySeries(days = 30) {
  const since = Date.now() - days * DAY_MS
  const rows = await db.select({
    day: sql<string>`date(${events.ts}/1000, 'unixepoch')`,
    kind: events.kind,
    n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(gte(events.ts, since))
    .groupBy(sql`date(${events.ts}/1000, 'unixepoch')`, events.kind)
  return rows
}

// ─── A14: Top senders leaderboard ────────────────────────────────────
export async function topSenders(days = 30, limit = 10) {
  const since = Date.now() - days * DAY_MS
  const rows = await db.select({
    uid: events.userId,
    n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.kind, 'sent'), gte(events.ts, since)))
    .groupBy(events.userId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit)
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.uid).filter((id): id is string => Boolean(id))
  const userRows = ids.length > 0
    ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids))
    : []
  const userMap = new Map(userRows.map((u) => [u.id, u.email]))
  return rows.map((r) => ({
    userId: r.uid ?? '', email: userMap.get(r.uid ?? '') ?? '—', sent: Number(r.n),
  }))
}

// ─── A15: Failed-send heatmap (day-of-week × hour, IST) ──────────────
export async function failureHeatmap(days = 30) {
  const since = Date.now() - days * DAY_MS
  const rows = await db.select({ scheduledAt: emailLog.scheduledAt }).from(emailLog)
    .where(and(eq(emailLog.status, 'Failed'), gte(emailLog.scheduledAt, since)))
  const grid: { dow: number; hour: number; n: number }[] = []
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid.push({ dow: d, hour: h, n: 0 })
  const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const istFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', hour12: false,
  })
  for (const r of rows) {
    const parts = istFmt.formatToParts(new Date(r.scheduledAt))
    const dow = DOW_MAP[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0
    let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) hour = 0
    const cell = grid[dow * 24 + hour]
    if (cell) cell.n++
  }
  return grid
}

// ─── A18: Recent admin actions preview ───────────────────────────────
export async function recentAdminActions(limit = 20) {
  const rows = await db.select({
    id: auditLog.id,
    action: auditLog.action,
    detail: auditLog.detail,
    createdAt: auditLog.createdAt,
    userEmail: users.email,
  }).from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(sql`${auditLog.action} LIKE 'admin.%'`)
    .orderBy(desc(auditLog.id))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    userEmail: r.userEmail ?? '—',
    createdAt: r.createdAt.toISOString(),
  }))
}

// ─── A17: Broadcast message (stored as latest admin.broadcast audit row) ─
export async function currentBroadcast(): Promise<{ message: string; at: string } | null> {
  const [row] = await db.select().from(auditLog)
    .where(eq(auditLog.action, 'admin.broadcast'))
    .orderBy(desc(auditLog.id))
    .limit(1)
  if (!row || !row.detail) return null
  return { message: row.detail, at: row.createdAt.toISOString() }
}
