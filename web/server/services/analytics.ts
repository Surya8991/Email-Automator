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
