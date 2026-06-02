// Data retention. The events + audit_log tables grow unbounded — a single
// campaign easily writes a few thousand events; admin-trace mode means
// every write hits audit_log. Without pruning, the DB and the CSV export
// both eventually OOM.
//
// Defaults: keep 180 days of events, 365 days of audit. Operators can
// override per-user via the EVENTS_RETENTION_DAYS / AUDIT_RETENTION_DAYS
// settings (rows in the `settings` table keyed by userId).
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { events, auditLog, settings } from '@/server/db/schema'
import { logger } from '@/lib/logger'

const log = logger.child({ component: 'retention' })

export const DEFAULT_EVENTS_DAYS = 180
export const DEFAULT_AUDIT_DAYS = 365

async function settingDays(userId: string, key: string, fallback: number): Promise<number> {
  const row = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
  const raw = row[0]?.value
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** Delete events older than the user's configured retention window. */
export async function purgeOldEvents(userId: string, days?: number): Promise<number> {
  const d = days ?? (await settingDays(userId, 'EVENTS_RETENTION_DAYS', DEFAULT_EVENTS_DAYS))
  const cutoff = Date.now() - d * 24 * 60 * 60 * 1000
  // events.ts is unix-ms (the column is `integer`, not timestamp_ms).
  const r = await db.delete(events)
    .where(and(eq(events.userId, userId), lt(events.ts, cutoff)))
    .returning({ id: events.id })
  return r.length
}

/** Delete audit rows older than the user's configured retention window. */
export async function purgeOldAudit(userId: string, days?: number): Promise<number> {
  const d = days ?? (await settingDays(userId, 'AUDIT_RETENTION_DAYS', DEFAULT_AUDIT_DAYS))
  const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000)
  const r = await db.delete(auditLog)
    .where(and(eq(auditLog.userId, userId), lt(auditLog.createdAt, cutoff)))
    .returning({ id: auditLog.id })
  return r.length
}

/**
 * Run the purge for one user, gated by a LAST_PURGE_AT setting so we only
 * do it once per ~24h. The scheduler tick calls this for every user it
 * processes — cheap when the gate is fresh, work only when overdue.
 */
export async function maybePurgeForUser(userId: string): Promise<{ events: number; audit: number } | null> {
  const row = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'LAST_PURGE_AT')))
  const last = Number(row[0]?.value ?? 0)
  const dayMs = 24 * 60 * 60 * 1000
  if (Number.isFinite(last) && Date.now() - last < dayMs) return null
  try {
    const ev = await purgeOldEvents(userId)
    const au = await purgeOldAudit(userId)
    // Upsert via delete+insert keeps the code dialect-agnostic across
    // better-sqlite3 / libsql / others — we don't lean on ON CONFLICT here.
    await db.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'LAST_PURGE_AT')))
    await db.insert(settings).values({ userId, key: 'LAST_PURGE_AT', value: String(Date.now()) })
    if (ev > 0 || au > 0) log.info({ userId, events: ev, audit: au }, 'retention purge')
    return { events: ev, audit: au }
  } catch (err) {
    log.error({ err, userId }, 'retention purge failed')
    return null
  }
}
