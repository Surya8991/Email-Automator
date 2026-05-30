import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { blocklist } from '@/server/db/schema'

export async function listBlocklist(userId: string) {
  return db.select().from(blocklist)
    .where(or(eq(blocklist.userId, userId), isNull(blocklist.userId)))
    .orderBy(desc(blocklist.id))
}

export async function addEntry(userId: string, pattern: string, type: 'email' | 'domain') {
  await db.insert(blocklist).values({ userId, pattern: pattern.trim().toLowerCase(), type })
}

export async function removeEntry(userId: string, id: number) {
  // Per-user rows only — never let a user touch the global (null userId) list.
  await db.delete(blocklist).where(and(eq(blocklist.id, id), eq(blocklist.userId, userId)))
}

export async function isBlocked(userId: string, email: string): Promise<boolean> {
  const list = await listBlocklist(userId)
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  const lc = email.toLowerCase()
  return list.some((b) => (b.type === 'email' ? b.pattern === lc : b.pattern === domain))
}
