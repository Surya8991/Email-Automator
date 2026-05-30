import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { events, contacts, drafts } from '@/server/db/schema'

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
  // grid[dow][hour] = { sent, opens }. Bucket in user's local IST so the
  // "10 AM" heatmap cell reflects 10 AM IST, not UTC.
  const grid: HourCell[] = []
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid.push({ dow: d, hour: h, sent: 0, opens: 0 })
  const cell = (ts: number): HourCell => {
    // Render the timestamp in IST to extract dow/hour without DST drift.
    // (Server's TZ may be UTC; we always bucket against IST.)
    const istString = new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    // "30/05/2026, 11:32:14 pm" → parse day, hour
    const d = new Date(ts)
    // Computing dow/hour against IST: shift ts by IST offset (+5:30 = 330 min).
    const istMs = ts + (330 * 60 * 1000) + (d.getTimezoneOffset() * 60 * 1000)
    const ist = new Date(istMs)
    const dow = ist.getUTCDay()
    const hour = ist.getUTCHours()
    return grid[dow * 24 + hour]!
    void istString // silence unused; the formatString above is a sanity guard
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
