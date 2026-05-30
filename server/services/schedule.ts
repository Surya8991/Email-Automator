import { and, asc, eq, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { contacts, emailLog, type Contact, type Template } from '@/server/db/schema'
import { getActive } from './templates'
import { buildEmail } from './drafts'
import { formatDate, APP_TZ } from '@/lib/utils'

// Random 3–5 minute stagger between scheduled emails. Mirrors v1.
function staggerMs(): number {
  const min = 3 * 60 * 1000, max = 5 * 60 * 1000
  return Math.floor(min + Math.random() * (max - min))
}

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

export async function previewSchedule(userId: string, startMs: number) {
  const tpl = await getActive(userId)
  if (!tpl) return { error: 'No active template' as const }
  const cs = await eligibleContacts(userId)
  if (cs.length === 0) return { error: 'No contacts ready' as const }

  let next = startMs
  const preview = cs.slice(0, 20).map((c) => {
    const e = buildEmail(tpl, c)
    const at = new Date(next)
    next += staggerMs()
    return { email: c.recruiterEmail, name: c.recruiterName, company: c.company, subject: e.subject, scheduledAt: at.toISOString() }
  })
  return {
    total: cs.length,
    firstAt: new Date(startMs).toISOString(),
    lastAt: new Date(next).toISOString(),
    preview,
  }
}

export async function enqueue(userId: string, startMs: number): Promise<{ scheduled: number }> {
  const tpl = await getActive(userId)
  if (!tpl) throw new Error('No active template')
  const cs = await eligibleContacts(userId)
  if (cs.length === 0) throw new Error('No contacts ready')

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
    next += staggerMs()
    scheduled++
  }
  return { scheduled }
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
