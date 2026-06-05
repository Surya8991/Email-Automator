import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { blocklist, contacts } from '@/server/db/schema'

export async function listBlocklist(userId: string) {
  return db.select().from(blocklist)
    .where(or(eq(blocklist.userId, userId), isNull(blocklist.userId)))
    .orderBy(desc(blocklist.id))
}

export async function addEntry(userId: string, pattern: string, type: 'email' | 'domain') {
  await db.insert(blocklist).values({ userId, pattern: pattern.trim().toLowerCase(), type })
}

// Restore any contacts that were soft-deleted by `bulkBlockAction` for the
// given lowercased email patterns. We clear their BLOCKED status and bump
// `num` to (current-max + 1) so the unblocked contact lands at the end of
// the list — exactly where the user expects to find it after unblocking.
async function restoreBlockedContacts(userId: string, patterns: string[]) {
  if (patterns.length === 0) return
  const emailMatchers = patterns.map((p) => sql`LOWER(${contacts.recruiterEmail}) = ${p}`)
  const matchEmail = or(...emailMatchers)
  // Read the current max num so the restored rows land at the bottom of
  // the user's list — predictable placement instead of being scattered.
  const [maxRow] = await db.select({ m: sql<number>`COALESCE(MAX(${contacts.num}), 0)` })
    .from(contacts).where(eq(contacts.userId, userId))
  let nextNum = Number(maxRow?.m ?? 0)
  const blocked = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.emailStatus, 'BLOCKED'), matchEmail!))
  for (const r of blocked) {
    nextNum++
    await db.update(contacts).set({ emailStatus: '', num: nextNum })
      .where(eq(contacts.id, r.id))
  }
}

export async function removeEntry(userId: string, id: number) {
  // Per-user rows only — never let a user touch the global (null userId) list.
  const [target] = await db.select({ pattern: blocklist.pattern, type: blocklist.type })
    .from(blocklist).where(and(eq(blocklist.id, id), eq(blocklist.userId, userId)))
  await db.delete(blocklist).where(and(eq(blocklist.id, id), eq(blocklist.userId, userId)))
  if (target?.type === 'email') {
    await restoreBlockedContacts(userId, [String(target.pattern).toLowerCase()])
  }
  return { restored: target?.type === 'email' }
}

// Bulk remove. Same tenancy guard — global rows (userId=null) are untouched
// because the WHERE pins userId. Returns the requested count for the toast.
export async function removeEntries(userId: string, ids: number[]): Promise<number> {
  if (!ids || ids.length === 0) return 0
  const rows = await db.select({ pattern: blocklist.pattern, type: blocklist.type })
    .from(blocklist).where(and(eq(blocklist.userId, userId), inArray(blocklist.id, ids)))
  await db.delete(blocklist).where(and(eq(blocklist.userId, userId), inArray(blocklist.id, ids)))
  const emails = rows.filter((r) => r.type === 'email').map((r) => String(r.pattern).toLowerCase())
  await restoreBlockedContacts(userId, emails)
  return ids.length
}

// Read-only helper used by tests / future UI to count BLOCKED soft-deleted rows.
export async function countBlockedContacts(userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.emailStatus, 'BLOCKED')))
  return Number(r?.n ?? 0)
}

export async function isBlocked(userId: string, email: string): Promise<boolean> {
  // Targeted WHERE — touches at most 2 rows (one email match + one domain
  // match) instead of loading the full per-user + global blocklist into
  // memory and filtering in JS. Significant win when blocklists grow
  // (auto-blocks from unsubscribes, bulk paste-adds) and called per send
  // by the scheduler. LIMIT 1 stops the scan on first match.
  const lc = email.toLowerCase().trim()
  if (!lc) return false
  const domain = (lc.split('@')[1] ?? '').toLowerCase()
  const conds = [and(eq(blocklist.type, 'email'), eq(blocklist.pattern, lc))]
  if (domain) conds.push(and(eq(blocklist.type, 'domain'), eq(blocklist.pattern, domain)))
  const rows = await db.select({ id: blocklist.id }).from(blocklist)
    .where(and(
      or(eq(blocklist.userId, userId), isNull(blocklist.userId)),
      or(...conds)!,
    ))
    .limit(1)
  return rows.length > 0
}
