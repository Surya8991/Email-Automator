import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { events, contacts, drafts, users, templates, campaigns } from '@/server/db/schema'

const DAY_MS = 24 * 60 * 60 * 1000

async function countWhere(userId: string, kind: string, since: number): Promise<number> {
  const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(events)
    .where(and(eq(events.userId, userId), eq(events.kind, kind), gte(events.ts, since)))
  return Number(rows[0]?.n ?? 0)
}

export async function kpis(userId: string) {
  const since = Date.now() - 30 * DAY_MS
  const [sent, opens, clicks, replies, bounces] = await Promise.all([
    countWhere(userId, 'sent', since),
    countWhere(userId, 'open', since),
    countWhere(userId, 'click', since),
    countWhere(userId, 'reply', since),
    countWhere(userId, 'bounce', since),
  ])
  const totalContactsRows = await db.select({ n: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.userId, userId))
  const pendingDraftsRows = await db.select({ n: sql<number>`COUNT(*)` }).from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'draft')))
  const totalContacts = Number(totalContactsRows[0]?.n ?? 0)
  const pendingDrafts = Number(pendingDraftsRows[0]?.n ?? 0)
  const rate = (part: number) => (sent ? part / sent : 0)
  return {
    sent, opens, clicks, replies, bounces,
    openRate: rate(opens), clickRate: rate(clicks), replyRate: rate(replies), bounceRate: rate(bounces),
    totalContacts, pendingDrafts,
  }
}

// Instance-wide totals for the admin landing page. Six COUNTs fired in
// parallel. No per-user scoping — caller MUST be admin (gated in the page).
export async function systemStats() {
  const since30 = Date.now() - 30 * DAY_MS
  const [u, c, t, d, sent30, cAct] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(users),
    db.select({ n: sql<number>`COUNT(*)` }).from(contacts),
    db.select({ n: sql<number>`COUNT(*)` }).from(templates),
    db.select({ n: sql<number>`COUNT(*)` }).from(drafts).where(eq(drafts.status, 'draft')),
    db.select({ n: sql<number>`COUNT(*)` }).from(events).where(and(eq(events.kind, 'sent'), gte(events.ts, since30))),
    db.select({ n: sql<number>`COUNT(*)` }).from(campaigns).where(eq(campaigns.status, 'active')),
  ])
  return {
    users: Number(u[0]?.n ?? 0),
    contacts: Number(c[0]?.n ?? 0),
    templates: Number(t[0]?.n ?? 0),
    draftsPending: Number(d[0]?.n ?? 0),
    sent30d: Number(sent30[0]?.n ?? 0),
    activeCampaigns: Number(cAct[0]?.n ?? 0),
  }
}

// Per-user counts in 3 grouped queries instead of N+1. Returns a Map keyed
// by userId so the admin page can stitch counts onto its user list.
export async function perUserStats(): Promise<Map<string, { contacts: number; drafts: number; events: number }>> {
  const [c, d, e] = await Promise.all([
    db.select({ uid: contacts.userId, n: sql<number>`COUNT(*)` })
      .from(contacts).groupBy(contacts.userId),
    db.select({ uid: drafts.userId, n: sql<number>`COUNT(*)` })
      .from(drafts).groupBy(drafts.userId),
    db.select({ uid: events.userId, n: sql<number>`COUNT(*)` })
      .from(events).groupBy(events.userId),
  ])
  const out = new Map<string, { contacts: number; drafts: number; events: number }>()
  const ensure = (uid: string) => {
    let row = out.get(uid)
    if (!row) { row = { contacts: 0, drafts: 0, events: 0 }; out.set(uid, row) }
    return row
  }
  for (const r of c) ensure(String(r.uid)).contacts = Number(r.n ?? 0)
  for (const r of d) ensure(String(r.uid)).drafts = Number(r.n ?? 0)
  for (const r of e) ensure(String(r.uid)).events = Number(r.n ?? 0)
  return out
}

// Job-search pipeline snapshot — counts contacts grouped by status. Used
// by the admin-only KPI row on /analytics. Status strings follow the
// Universal Job Tracker convention (Applied / Phone Screen / Interview 1 /
// Interview 2 / Final Round / Offer* / Hired / Reject* / Not Applied).
export async function pipelineKpis(userId: string) {
  const rows = await db
    .select({ status: contacts.status, n: sql<number>`COUNT(*)` })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .groupBy(contacts.status)
  const buckets = { applied: 0, pipeline: 0, offers: 0, rejections: 0 }
  const PIPELINE = new Set(['Applied', 'Phone Screen', 'Interview 1', 'Interview 2', 'Final Round'])
  for (const r of rows) {
    const s = String(r.status ?? '')
    const n = Number(r.n ?? 0)
    if (!s || s === 'Not Applied') continue
    buckets.applied += n
    if (PIPELINE.has(s)) buckets.pipeline += n
    else if (/^Offer/i.test(s) || s === 'Hired') buckets.offers += n
    else if (/^Reject/i.test(s)) buckets.rejections += n
  }
  const responded = buckets.pipeline + buckets.offers + buckets.rejections
  const responseRate = buckets.applied > 0 ? responded / buckets.applied : 0
  return { ...buckets, responseRate }
}

export async function dailySeries(userId: string, days = 14) {
  const since = Date.now() - days * DAY_MS
  const rows = await db.select({
    day: sql<string>`date(${events.ts}/1000, 'unixepoch')`,
    kind: events.kind,
    n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
    .groupBy(sql`date(${events.ts}/1000, 'unixepoch')`, events.kind)
  return rows
}

// ─── Breakdowns ───────────────────────────────────────────────────────
// Aggregate event counts grouped by the dimension passed. Replies / opens
// / clicks / bounces all derived from the events table, so anything that
// scheduler-tick recorded with templateId / contactId shows up here.

export interface BreakdownRow {
  key: string; label: string
  sent: number; opens: number; clicks: number; replies: number
}

export async function breakdownByTemplate(userId: string, days = 30): Promise<BreakdownRow[]> {
  const since = Date.now() - days * DAY_MS
  const rows = await db.select({
    templateId: events.templateId, kind: events.kind, n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
    .groupBy(events.templateId, events.kind)

  // Resolve template labels in a separate query — cheap and keeps the
  // dual-driver compatible (no JOINs).
  const { templates } = await import('@/server/db/schema')
  const tplRows = await db.select({ id: templates.id, label: templates.label, key: templates.key })
    .from(templates).where(eq(templates.userId, userId))
  const tplName = new Map(tplRows.map((t) => [t.id, t.label || t.key]))

  return aggregate(rows.map((r) => ({
    key: String(r.templateId ?? 'none'),
    label: r.templateId ? (tplName.get(r.templateId) ?? `Template ${r.templateId}`) : '— No template —',
    kind: r.kind,
    n: Number(r.n),
  })))
}

export async function breakdownByTag(userId: string, days = 30): Promise<BreakdownRow[]> {
  const since = Date.now() - days * DAY_MS
  // Join events.contactId → contacts.tags client-side. Most users have
  // <1k contacts and <10k events; faster + portable.
  const evRows = await db.select({
    contactId: events.contactId, kind: events.kind, n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
    .groupBy(events.contactId, events.kind)
  const conRows = await db.select({ id: contacts.id, tags: contacts.tags })
    .from(contacts).where(eq(contacts.userId, userId))
  const tagsFor = new Map(conRows.map((c) => [c.id, (c.tags || '').split(',').filter(Boolean)]))

  // Expand each event into one row per tag the contact has, so a multi-tag
  // contact counts toward each of its tags' totals.
  const expanded: Array<{ key: string; label: string; kind: string; n: number }> = []
  for (const r of evRows) {
    const tags = r.contactId ? (tagsFor.get(r.contactId) ?? []) : []
    if (tags.length === 0) expanded.push({ key: '_none', label: '— no tag —', kind: r.kind, n: Number(r.n) })
    else for (const t of tags) expanded.push({ key: t, label: `#${t}`, kind: r.kind, n: Number(r.n) })
  }
  return aggregate(expanded)
}

// B6 — Follow-up reminders. Buckets active contacts (not Replied/Bounced/
// Blocked) by days-since-last-send. Surfaces an at-a-glance "who needs
// a nudge" widget on /contacts: Overdue >14d, Soon 7-13d, On track <7d,
// Never sent. Sent-but-no-reply is the implicit target — these are
// contacts you've already started a conversation with but the thread has
// gone quiet.
export interface FollowUpBuckets {
  overdue: number      // last sent > 14 days ago
  soon: number         // last sent 7-13 days ago
  onTrack: number      // last sent < 7 days ago
  neverSent: number    // active contact, no send recorded
}

export async function followUpBuckets(userId: string): Promise<FollowUpBuckets> {
  const now = Date.now()
  const overdueCut = now - 14 * DAY_MS
  const soonCut = now - 7 * DAY_MS
  // Active contacts: not in BLOCKED / BOUNCED / Replied states. We treat
  // any emailStatus starting with "Replied" as resolved (no further nudge).
  const activeRows = await db.select({ id: contacts.id, emailStatus: contacts.emailStatus })
    .from(contacts).where(eq(contacts.userId, userId))
  const activeIds = new Set<number>()
  for (const r of activeRows) {
    const s = r.emailStatus
    if (s === 'BLOCKED' || s === 'BOUNCED' || s.startsWith('Replied')) continue
    activeIds.add(r.id)
  }
  if (activeIds.size === 0) return { overdue: 0, soon: 0, onTrack: 0, neverSent: 0 }

  // Last-sent-per-contact in one grouped query.
  const lastRows = await db.select({
    contactId: events.contactId,
    lastTs: sql<number>`MAX(${events.ts})`,
  }).from(events)
    .where(and(eq(events.userId, userId), eq(events.kind, 'sent')))
    .groupBy(events.contactId)
  const lastByContact = new Map<number, number>()
  for (const r of lastRows) if (r.contactId) lastByContact.set(r.contactId, Number(r.lastTs))

  const buckets: FollowUpBuckets = { overdue: 0, soon: 0, onTrack: 0, neverSent: 0 }
  for (const id of activeIds) {
    const last = lastByContact.get(id)
    if (!last) { buckets.neverSent++; continue }
    if (last < overdueCut) buckets.overdue++
    else if (last < soonCut) buckets.soon++
    else buckets.onTrack++
  }
  return buckets
}

// B7 — per-platform activity tracker. Slice events by the source
// platform of each event's contact (LinkedIn / Indeed / Naukri / etc.).
// Helps the user see "where am I actually getting replies from" so they
// can double down on high-response sources and drop low ones.
export async function breakdownByPlatform(userId: string, days = 30): Promise<BreakdownRow[]> {
  const since = Date.now() - days * DAY_MS
  const evRows = await db.select({
    contactId: events.contactId, kind: events.kind, n: sql<number>`COUNT(*)`,
  }).from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
    .groupBy(events.contactId, events.kind)
  const conRows = await db.select({ id: contacts.id, platform: contacts.platform })
    .from(contacts).where(eq(contacts.userId, userId))
  const platformFor = new Map(conRows.map((c) => [c.id, c.platform || '_unknown']))
  const expanded: Array<{ key: string; label: string; kind: string; n: number }> = []
  for (const r of evRows) {
    const platform = r.contactId ? (platformFor.get(r.contactId) ?? '_unknown') : '_unknown'
    const label = platform === '_unknown' ? '— no platform —' : platform
    expanded.push({ key: platform, label, kind: r.kind, n: Number(r.n) })
  }
  return aggregate(expanded)
}

export async function breakdownByCampaign(userId: string, days = 30): Promise<BreakdownRow[]> {
  const since = Date.now() - days * DAY_MS
  // We don't have campaignId as a column on events; parse the meta JSON.
  const evRows = await db.select().from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
  const { campaigns } = await import('@/server/db/schema')
  const campRows = await db.select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns).where(eq(campaigns.userId, userId))
  const nameFor = new Map(campRows.map((c) => [c.id, c.name]))

  const expanded: Array<{ key: string; label: string; kind: string; n: number }> = []
  for (const e of evRows) {
    let m: { campaignId?: number } = {}
    try { m = JSON.parse(e.meta || '{}') } catch { /* ignore */ }
    const cid = m.campaignId
    if (!cid) continue // skip one-off sends
    expanded.push({ key: String(cid), label: nameFor.get(cid) ?? `Campaign ${cid}`, kind: e.kind, n: 1 })
  }
  return aggregate(expanded)
}

/**
 * Hourly send-time heatmap. For each (day-of-week × hour-of-day) bucket,
 * count the sent events and how many of them later received an open
 * (matched by emailLogId in meta). Use this to find your best windows.
 *
 * Returns a flat array of 7×24 = 168 cells; the page renders the grid.
 */
export interface HourCell { dow: number; hour: number; sent: number; opens: number }

export async function sendTimeHeatmap(userId: string, days = 30): Promise<HourCell[]> {
  const since = Date.now() - days * DAY_MS
  // Pull both sent + open events in the window. Bucketing in JS keeps the
  // SQL portable across the dual driver and avoids strftime quirks.
  const evRows = await db.select().from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, since)))
  // Match opens to sends via meta.emailLogId so we attribute the open to
  // the original send hour, not the hour it was opened.
  const sendByLogId = new Map<number, number>() // emailLogId → sent ts
  for (const e of evRows) {
    if (e.kind !== 'sent') continue
    try {
      const m = JSON.parse(e.meta || '{}') as { emailLogId?: number }
      if (m.emailLogId) sendByLogId.set(m.emailLogId, e.ts)
    } catch { /* ignore */ }
  }
  // grid[dow][hour] = { sent, opens }. Bucket in IST so the "10 AM" cell
  // reflects 10 AM IST regardless of the server's own timezone.
  const grid: HourCell[] = []
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid.push({ dow: d, hour: h, sent: 0, opens: 0 })
  // Use Intl.DateTimeFormat to extract IST dow/hour directly — avoids the
  // earlier server-TZ-dependent math that broke on IST hosts.
  const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const istFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', hour12: false,
  })
  const cell = (ts: number): HourCell => {
    const parts = istFmt.formatToParts(new Date(ts))
    const dow = DOW_MAP[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0
    // hour: 'numeric'+'2-digit' with hour12=false can return "24" at midnight
    // on some runtimes; clamp into 0..23.
    let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    if (!Number.isFinite(hour) || hour < 0) hour = 0
    if (hour > 23) hour = 0
    return grid[dow * 24 + hour]!
  }
  for (const e of evRows) {
    if (e.kind === 'sent') {
      const c = cell(e.ts); c.sent++
    } else if (e.kind === 'open') {
      // Attribute the open to its original send-hour, not the open-hour.
      let openLogId: number | undefined
      try { openLogId = (JSON.parse(e.meta || '{}') as { emailLogId?: number }).emailLogId } catch { /* ignore */ }
      const sentTs = openLogId ? sendByLogId.get(openLogId) : undefined
      if (sentTs) cell(sentTs).opens++
    }
  }
  return grid
}

function aggregate(rows: Array<{ key: string; label: string; kind: string; n: number }>): BreakdownRow[] {
  const m = new Map<string, BreakdownRow>()
  for (const r of rows) {
    const cur = m.get(r.key) ?? { key: r.key, label: r.label, sent: 0, opens: 0, clicks: 0, replies: 0 }
    if (r.kind === 'sent') cur.sent += r.n
    else if (r.kind === 'open') cur.opens += r.n
    else if (r.kind === 'click') cur.clicks += r.n
    else if (r.kind === 'reply') cur.replies += r.n
    m.set(r.key, cur)
  }
  // Sort by sent desc so the most-active row leads.
  return Array.from(m.values()).sort((a, b) => b.sent - a.sent)
}
