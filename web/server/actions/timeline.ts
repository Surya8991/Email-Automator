'use server'
import { and, asc, eq } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts, emailLog, events } from '@/server/db/schema'

export interface TimelineItem { at: number; label: string; detail?: string }

export async function fetchTimelineAction(contactId: number): Promise<{ items: TimelineItem[] } | { error: string }> {
  const u = await requireUser()
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.userId, u.id)))
  if (!c) return { error: 'Contact not found' }

  const items: TimelineItem[] = [{ at: c.createdAt.getTime(), label: 'Added to contacts' }]

  const evs = await db.select().from(events).where(and(eq(events.userId, u.id), eq(events.contactId, c.id))).orderBy(asc(events.ts))
  for (const e of evs) items.push({ at: e.ts, label: `Event: ${e.kind}`, detail: e.meta })

  const logs = await db.select().from(emailLog).where(and(eq(emailLog.userId, u.id), eq(emailLog.contactId, c.id))).orderBy(asc(emailLog.id))
  for (const l of logs) {
    items.push({ at: l.scheduledAt, label: `${l.status}: ${l.subject}`, detail: l.lastResult || undefined })
  }

  if (c.emailStatus) items.push({ at: Date.now(), label: `Current status: ${c.emailStatus}` })

  items.sort((a, b) => a.at - b.at)
  return { items }
}
