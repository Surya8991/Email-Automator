import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { contacts, emailLog, type Contact, type Template } from '@/server/db/schema'
import { getActive } from './templates'
import { buildEmail } from './drafts'
import { formatDate, APP_TZ } from '@/lib/utils'

// Random stagger in [minMin, maxMin] minutes between sends. Caller picks
// the window (Schedule page form fields); we clamp + jitter here. The
// default 3–5 mirrors v1.
function staggerMs(minMin: number, maxMin: number): number {
  const lo = Math.max(0, Math.min(minMin, maxMin)) * 60_000
  const hi = Math.max(0, Math.max(minMin, maxMin)) * 60_000
  if (hi === lo) return lo
  return Math.floor(lo + Math.random() * (hi - lo))
}

export const DEFAULT_INTERVAL = { min: 3, max: 5 } as const

async function eligibleContacts(userId: string): Promise<Contact[]> {
  return db.select().from(contacts).where(
    and(
      eq(contacts.userId, userId),
      sql`${contacts.recruiterEmail} != ''`,
      sql`${contacts.emailStatus} NOT LIKE '%Draft Created%'`,
      sql`${contacts.emailStatus} NOT LIKE '%Sent%'`,
      sql`${contacts.emailStatus} NOT LIKE '%Scheduled%'`,
      sql`${contacts.emailStatus} NOT LIKE '%BOUNCED%'`
    )
  )
}

export interface IntervalOpt { intervalMin?: number; intervalMax?: number }

export async function previewSchedule(userId: string, startMs: number, opt: IntervalOpt = {}) {
  const tpl = await getActive(userId)
  if (!tpl) return { error: 'No active template' as const }
  const cs = await eligibleContacts(userId)
  if (cs.length === 0) return { error: 'No contacts ready' as const }
  const minM = opt.intervalMin ?? DEFAULT_INTERVAL.min
  const maxM = opt.intervalMax ?? DEFAULT_INTERVAL.max

  let next = startMs
  const preview = cs.slice(0, 20).map((c) => {
    const e = buildEmail(tpl, c)
    const at = new Date(next)
    next += staggerMs(minM, maxM)
    return { email: c.recruiterEmail, name: c.recruiterName, company: c.company, subject: e.subject, scheduledAt: at.toISOString() }
  })
  // Walk the remaining contacts (just the timestamp) so lastAt reflects
  // the true tail of the queue, not just the 20-row preview window.
  for (let i = 20; i < cs.length; i++) next += staggerMs(minM, maxM)
  return {
    total: cs.length,
    firstAt: new Date(startMs).toISOString(),
    lastAt: new Date(next).toISOString(),
    intervalMin: minM,
    intervalMax: maxM,
    preview,
  }
}

export async function enqueue(userId: string, startMs: number, opt: IntervalOpt = {}): Promise<{ scheduled: number }> {
  const tpl = await getActive(userId)
  if (!tpl) throw new Error('No active template')
  const cs = await eligibleContacts(userId)
  if (cs.length === 0) throw new Error('No contacts ready')
  const minM = opt.intervalMin ?? DEFAULT_INTERVAL.min
  const maxM = opt.intervalMax ?? DEFAULT_INTERVAL.max

  let next = startMs, scheduled = 0
  for (const contact of cs) {
    const e = buildEmail(tpl, contact)
    await db.insert(emailLog).values({
      userId, contactId: contact.id,
      scheduleId: `sched_${next}_${contact.id}`,
      email: contact.recruiterEmail, subject: e.subject, body: e.html,
      scheduledAt: next, status: 'Scheduled',
    })
    // Render all stored timestamps in IST (en-IN locale) so the
    // contact row and "Scheduled for…" status read the same way the
    // Schedule page does — regardless of Vercel's UTC runtime.
    const d = new Date(next)
    await db.update(contacts).set({
      emailStatus: `Scheduled for ${formatDate(d)}`,
      scheduleDate: d.toLocaleDateString('en-IN', { timeZone: APP_TZ }),
      scheduleTime: d.toLocaleTimeString('en-IN', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit' }),
    }).where(eq(contacts.id, contact.id))
    next += staggerMs(minM, maxM)
    scheduled++
  }
  return { scheduled }
}

// Like enqueue() but only for the explicitly-provided contact ids.
// Tenancy: the SELECT filters by userId so a leaked id from another
// tenant gets silently skipped. Status guard mirrors eligibleContacts.
export async function enqueueContacts(
  userId: string,
  contactIds: number[],
  startMs: number,
  opt: IntervalOpt = {},
): Promise<{ scheduled: number; skipped: number }> {
  if (!contactIds || contactIds.length === 0) return { scheduled: 0, skipped: 0 }
  const tpl = await getActive(userId)
  if (!tpl) throw new Error('No active template')
  const eligible = await db.select().from(contacts).where(and(
    eq(contacts.userId, userId),
    inArray(contacts.id, contactIds),
    sql`${contacts.recruiterEmail} != ''`,
    sql`${contacts.emailStatus} NOT LIKE '%Draft Created%'`,
    sql`${contacts.emailStatus} NOT LIKE '%Sent%'`,
    sql`${contacts.emailStatus} NOT LIKE '%Scheduled%'`,
    sql`${contacts.emailStatus} NOT LIKE '%BOUNCED%'`,
  ))
  const skipped = contactIds.length - eligible.length
  if (eligible.length === 0) return { scheduled: 0, skipped }

  const minM = opt.intervalMin ?? DEFAULT_INTERVAL.min
  const maxM = opt.intervalMax ?? DEFAULT_INTERVAL.max
  let next = startMs, scheduled = 0
  for (const contact of eligible) {
    const e = buildEmail(tpl, contact)
    await db.insert(emailLog).values({
      userId, contactId: contact.id,
      scheduleId: `sched_${next}_${contact.id}`,
      email: contact.recruiterEmail, subject: e.subject, body: e.html,
      scheduledAt: next, status: 'Scheduled',
    })
    const d = new Date(next)
    await db.update(contacts).set({
      emailStatus: `Scheduled for ${formatDate(d)}`,
      scheduleDate: d.toLocaleDateString('en-IN', { timeZone: APP_TZ }),
      scheduleTime: d.toLocaleTimeString('en-IN', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit' }),
    }).where(and(eq(contacts.id, contact.id), eq(contacts.userId, userId)))
    next += staggerMs(minM, maxM)
    scheduled++
  }
  return { scheduled, skipped }
}

export async function listScheduled(userId: string) {
  return db.select().from(emailLog).where(
    and(eq(emailLog.userId, userId), or(eq(emailLog.status, 'Scheduled'), eq(emailLog.status, 'Retrying'))!)
  ).orderBy(asc(emailLog.scheduledAt))
}

export async function cancelAll(userId: string): Promise<{ cancelled: number }> {
  const rows = await listScheduled(userId)
  for (const r of rows) {
    await db.update(emailLog).set({ status: 'Cancelled', lastResult: 'Cancelled' }).where(eq(emailLog.id, r.id))
    if (r.contactId) {
      await db.update(contacts).set({ emailStatus: 'Cancelled' }).where(eq(contacts.id, r.contactId))
    }
  }
  return { cancelled: rows.length }
}

/**
 * Cancel a specific list of queued (Scheduled / Retrying) email_log rows.
 * Multi-tenant safe: only rows owned by this userId can be cancelled,
 * even if the caller passes IDs from another user's queue.
 */
export async function cancelByIds(userId: string, ids: number[]): Promise<{ cancelled: number }> {
  if (!ids || ids.length === 0) return { cancelled: 0 }
  const rows = await db.select().from(emailLog)
    .where(and(eq(emailLog.userId, userId), sql`${emailLog.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`))
  let n = 0
  for (const r of rows) {
    if (r.status !== 'Scheduled' && r.status !== 'Retrying') continue
    await db.update(emailLog).set({ status: 'Cancelled', lastResult: 'Cancelled' }).where(eq(emailLog.id, r.id))
    if (r.contactId) {
      await db.update(contacts).set({ emailStatus: 'Cancelled' }).where(eq(contacts.id, r.contactId))
    }
    n++
  }
  return { cancelled: n }
}
