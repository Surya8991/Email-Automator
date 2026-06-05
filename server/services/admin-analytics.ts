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
export type QueueStatusFilter = 'Scheduled' | 'Retrying' | 'Sending'
const DEFAULT_ACTIVE_STATUSES: QueueStatusFilter[] = ['Scheduled', 'Retrying', 'Sending']

export async function activeSendQueue(
  limit = 25,
  userId?: string,
  statuses?: QueueStatusFilter[],
  offset = 0,
) {
  const statusList = statuses && statuses.length > 0 ? statuses : DEFAULT_ACTIVE_STATUSES
  const baseWhere = inArray(emailLog.status, statusList)
  const where = userId ? and(baseWhere, eq(emailLog.userId, userId)) : baseWhere
  const rows = await db.select({
    id: emailLog.id,
    userEmail: users.email,
    recipient: emailLog.email,
    subject: emailLog.subject,
    status: emailLog.status,
    scheduledAt: emailLog.scheduledAt,
  }).from(emailLog)
    .leftJoin(users, eq(emailLog.userId, users.id))
    .where(where)
    .orderBy(asc(emailLog.scheduledAt))
    .limit(limit)
    .offset(offset)
  // Total count for pagination — counts ALL matching rows, not just the page.
  const totalRows = await db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(where)
  return {
    rows: rows.map((r) => ({
      ...r,
      userEmail: r.userEmail ?? '—',
      scheduledAt: new Date(r.scheduledAt).toISOString(),
    })),
    total: Number(totalRows[0]?.n ?? 0),
  }
}

// Compact user list for admin filter dropdowns — id + email only.
export async function listAllUsersForFilter() {
  return db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email))
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
// Collapsed from 14 sequential SELECT COUNT(*) into 7 round trips:
// - 1 user lookup
// - 1 events GROUP BY kind covering sent/open/click/reply/bounce + lastTs
// - 1 contacts count
// - 1 drafts count
// - 1 email_log queued count
// - 1 active-campaigns count
// - 1 settings batch covering all 4 user-config keys
// - 1 recent-sends fetch
// All non-sequential queries fire in Promise.all so the wall-clock is
// limited by the slowest of the parallel batch.
const USER_SETTING_KEYS = [
  'PER_RECIPIENT_THROTTLE_DAYS',
  'PER_DOMAIN_DAILY_CAP',
  'DAILY_SEND_LIMIT_OVERRIDE',
  'SENDS_PAUSED',
] as const

export async function userDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return null
  const since30 = Date.now() - 30 * DAY_MS

  const [eventBuckets, contactsN, draftsN, queued, activeCampaignsN, settingsRows, recentSends] = await Promise.all([
    db.select({
      kind: events.kind,
      n: sql<number>`COUNT(*)`,
      lastTs: sql<number>`MAX(${events.ts})`,
    }).from(events)
      .where(and(eq(events.userId, userId), gte(events.ts, since30)))
      .groupBy(events.kind),
    db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, userId)),
    db.select({ n: sql<number>`COUNT(*)` }).from(drafts).where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft'))),
    db.select({ n: sql<number>`COUNT(*)` }).from(emailLog).where(and(eq(emailLog.userId, userId), inArray(emailLog.status, ['Scheduled', 'Retrying', 'Sending']))),
    db.select({ n: sql<number>`COUNT(*)` }).from(campaigns).where(and(eq(campaigns.userId, userId), eq(campaigns.status, 'active'))),
    db.select({ k: settings.key, v: settings.value }).from(settings)
      .where(and(eq(settings.userId, userId), inArray(settings.key, USER_SETTING_KEYS as unknown as string[]))),
    db.select({
      id: emailLog.id,
      recipient: emailLog.email,
      subject: emailLog.subject,
      status: emailLog.status,
      scheduledAt: emailLog.scheduledAt,
      lastResult: emailLog.lastResult,
    }).from(emailLog)
      .where(eq(emailLog.userId, userId))
      .orderBy(desc(emailLog.scheduledAt))
      .limit(10),
  ])

  // Pivot the event GROUP BY result into a per-kind shape.
  const byKind: Record<string, { n: number; lastTs: number | null }> = {}
  for (const r of eventBuckets) byKind[r.kind] = { n: Number(r.n), lastTs: r.lastTs ? Number(r.lastTs) : null }
  const settingsByKey = Object.fromEntries(settingsRows.map((r) => [r.k, r.v ?? '']))

  return {
    user: {
      id: user.id, email: user.email, name: user.name ?? '',
      createdAt: user.createdAt.toISOString(),
    },
    counts: {
      contacts: Number(contactsN[0]?.n ?? 0),
      draftsPending: Number(draftsN[0]?.n ?? 0),
      sent30: byKind.sent?.n ?? 0,
      opens30: byKind.open?.n ?? 0,
      clicks30: byKind.click?.n ?? 0,
      replies30: byKind.reply?.n ?? 0,
      bounces30: byKind.bounce?.n ?? 0,
      queued: Number(queued[0]?.n ?? 0),
      activeCampaigns: Number(activeCampaignsN[0]?.n ?? 0),
    },
    settings: {
      paused: settingsByKey['SENDS_PAUSED'] === 'true',
      throttleDays: Number(settingsByKey['PER_RECIPIENT_THROTTLE_DAYS'] ?? 0),
      domainCap: settingsByKey['PER_DOMAIN_DAILY_CAP'] ?? '',
      dailyLimitOverride: settingsByKey['DAILY_SEND_LIMIT_OVERRIDE'] ?? '',
    },
    lastSentAt: byKind.sent?.lastTs ? new Date(byKind.sent.lastTs).toISOString() : null,
    recentSends: recentSends.map((r) => ({ ...r, scheduledAt: new Date(r.scheduledAt).toISOString() })),
  }
}

// ─── DB latency probe — samples a handful of cheap reads, returns
// p50 / p95 / max in ms. Useful for spotting slow-query regressions or
// SQLite write-lock contention on the System tab. Cheap to run on every
// page render (each probe is a single-row read).
export async function dbLatencyProbe(samples = 5) {
  const ms: number[] = []
  for (let i = 0; i < samples; i++) {
    const start = performance.now()
    try {
      await db.select({ n: sql<number>`COUNT(*)` }).from(users).limit(1)
    } catch { /* skip the failed sample */ }
    ms.push(performance.now() - start)
  }
  ms.sort((a, b) => a - b)
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] ?? 0
  return {
    p50: Math.round(p(0.5)),
    p95: Math.round(p(0.95)),
    max: Math.round(ms[ms.length - 1] ?? 0),
    samples: ms.length,
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
      const dbPath = path.isAbsolute(dbUrl)
        ? dbUrl
        : path.join(/*turbopackIgnore: true*/ process.cwd(), dbUrl)
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
// SQL-bucketed: SQLite's strftime supports offset modifiers, so we shift
// the unix-ms timestamp into IST (+5:30) inside the query and bucket
// directly. Returns 168 rows max (7×24) instead of every failed-send row.
// Massive win on instances with many failures.
export async function failureHeatmap(days = 30) {
  const since = Date.now() - days * DAY_MS
  const buckets = await db.select({
    dow: sql<string>`strftime('%w', ${emailLog.scheduledAt}/1000, 'unixepoch', '+330 minutes')`,
    hour: sql<string>`strftime('%H', ${emailLog.scheduledAt}/1000, 'unixepoch', '+330 minutes')`,
    n: sql<number>`COUNT(*)`,
  }).from(emailLog)
    .where(and(eq(emailLog.status, 'Failed'), gte(emailLog.scheduledAt, since)))
    .groupBy(
      sql`strftime('%w', ${emailLog.scheduledAt}/1000, 'unixepoch', '+330 minutes')`,
      sql`strftime('%H', ${emailLog.scheduledAt}/1000, 'unixepoch', '+330 minutes')`,
    )
  // Build the full 168-cell grid and overlay the rows we got. strftime('%w')
  // returns Sun=0..Sat=6 matching our grid convention.
  const grid: { dow: number; hour: number; n: number }[] = []
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid.push({ dow: d, hour: h, n: 0 })
  for (const b of buckets) {
    const d = Number(b.dow); const h = Number(b.hour)
    if (!Number.isFinite(d) || !Number.isFinite(h) || d < 0 || d > 6 || h < 0 || h > 23) continue
    const cell = grid[d * 24 + h]
    if (cell) cell.n = Number(b.n)
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
// Cached by tag — the layout reads this on every (app) page render for
// every signed-in user. broadcastAction calls revalidateTag('broadcast')
// to invalidate. Without the cache, every navigation does a DB hit.
import { unstable_cache } from 'next/cache'

export const currentBroadcast = unstable_cache(
  async (): Promise<{ message: string; at: string } | null> => {
    const [row] = await db.select().from(auditLog)
      .where(eq(auditLog.action, 'admin.broadcast'))
      .orderBy(desc(auditLog.id))
      .limit(1)
    if (!row || !row.detail) return null
    return { message: row.detail, at: row.createdAt.toISOString() }
  },
  ['current-broadcast'],
  { tags: ['broadcast'], revalidate: 300 },
)
