import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { contacts } from '@/server/db/schema'

export interface ListOpts {
  page?: number; pageSize?: number; search?: string; tag?: string; status?: string
  company?: string; location?: string; platform?: string
}

export async function listContacts(userId: string, opts: ListOpts = {}) {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const clauses = [eq(contacts.userId, userId)]
  if (opts.search) {
    clauses.push(
      or(
        like(contacts.recruiterName, `%${opts.search}%`),
        like(contacts.company, `%${opts.search}%`),
        like(contacts.recruiterEmail, `%${opts.search}%`),
        like(contacts.jobTitle, `%${opts.search}%`)
      )!
    )
  }
  if (opts.tag) {
    // tags stored as comma-separated; surround stored value with commas so
    // a search for "vc" doesn't match "newvc".
    clauses.push(like(sql`',' || ${contacts.tags} || ','`, `%,${opts.tag},%`))
  }
  if (opts.status) {
    // Status is free-text ("Sent (5/30…)", "Scheduled for …"). 'pending'
    // is the special bucket for rows with no status set yet.
    if (opts.status === 'pending') clauses.push(eq(contacts.emailStatus, ''))
    else clauses.push(like(contacts.emailStatus, `%${opts.status}%`))
  }
  // Company / location / platform — exact match on the lowercase needle
  // against the lowercase column. Indexed-friendly compared to LIKE %x%.
  if (opts.company)  clauses.push(sql`LOWER(${contacts.company})  = LOWER(${opts.company})`)
  if (opts.location) clauses.push(sql`LOWER(${contacts.location}) = LOWER(${opts.location})`)
  if (opts.platform) clauses.push(sql`LOWER(${contacts.platform}) = LOWER(${opts.platform})`)
  const where = and(...clauses)

  const [rows, [totalRow]] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(asc(contacts.id)).limit(pageSize).offset(offset),
    db.select({ n: count() }).from(contacts).where(where),
  ])

  return { rows, total: totalRow?.n ?? 0, page, pageSize, pages: Math.max(1, Math.ceil((totalRow?.n ?? 0) / pageSize)) }
}

export async function emailExists(userId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), sql`LOWER(${contacts.recruiterEmail}) = LOWER(${email})`))
  return (row?.n ?? 0) > 0
}

export interface NewContact {
  recruiterEmail: string
  recruiterName?: string
  company?: string
  jobTitle?: string
  location?: string
  platform?: string
  sourceUrl?: string
  notes?: string
  tags?: string
}

function normalizeTags(s: string | undefined): string {
  if (!s) return ''
  return s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).join(',')
}

export async function addContact(userId: string, c: NewContact) {
  const countRows = await db.select({ n: count() }).from(contacts).where(eq(contacts.userId, userId))
  const n = countRows[0]?.n ?? 0
  await db.insert(contacts).values({
    userId,
    num: n + 1,
    recruiterEmail: c.recruiterEmail.trim(),
    recruiterName: c.recruiterName ?? '',
    company: c.company ?? '',
    jobTitle: c.jobTitle ?? '',
    location: c.location ?? '',
    platform: c.platform ?? '',
    sourceUrl: c.sourceUrl ?? '',
    notes: c.notes ?? '',
    tags: normalizeTags(c.tags),
  })
}

// All distinct tags across this user's contacts — for the filter dropdown.
export async function listTags(userId: string): Promise<string[]> {
  const rows = await db.select({ tags: contacts.tags }).from(contacts).where(eq(contacts.userId, userId))
  const set = new Set<string>()
  for (const r of rows) for (const t of (r.tags || '').split(',')) { if (t) set.add(t) }
  return Array.from(set).sort()
}

/** Distinct non-empty values for a contact column. Used to populate the
 *  company/location/platform filter dropdowns. Sorted ASCII. */
export async function listDistinct(userId: string, field: 'company' | 'location' | 'platform'): Promise<string[]> {
  const col = field === 'company' ? contacts.company : field === 'location' ? contacts.location : contacts.platform
  const rows = await db.select({ v: col }).from(contacts).where(eq(contacts.userId, userId))
  const set = new Set<string>()
  for (const r of rows) { const v = (r.v ?? '').trim(); if (v) set.add(v) }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export async function deleteContact(userId: string, id: number) {
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
}

export async function deleteContactsBulk(userId: string, ids: number[]) {
  for (const id of ids) await deleteContact(userId, id)
}

// Wipe every contact for this user. Returns the count that was removed
// so the caller can show a confirmation toast. Cascading FKs handle
// drafts (contact_id nullified) and campaign_enrollments (cascade).
export async function deleteAllContacts(userId: string): Promise<number> {
  const before = await db.select({ n: count() }).from(contacts)
    .where(eq(contacts.userId, userId))
  const n = Number(before[0]?.n ?? 0)
  if (n === 0) return 0
  await db.delete(contacts).where(eq(contacts.userId, userId))
  return n
}

// Same as deleteAllContacts but scoped to the current filter set. Used by
// the toolbar's "Delete all matching" so a user can scope a destructive
// action by tag / company / status without first paging through to select.
export async function deleteFilteredContacts(userId: string, opts: ListOpts = {}): Promise<number> {
  const clauses = [eq(contacts.userId, userId)]
  if (opts.search) {
    clauses.push(or(
      like(contacts.recruiterName, `%${opts.search}%`),
      like(contacts.company, `%${opts.search}%`),
      like(contacts.recruiterEmail, `%${opts.search}%`),
      like(contacts.jobTitle, `%${opts.search}%`),
    )!)
  }
  if (opts.tag) clauses.push(like(sql`',' || ${contacts.tags} || ','`, `%,${opts.tag},%`))
  if (opts.status) {
    if (opts.status === 'pending') clauses.push(eq(contacts.emailStatus, ''))
    else clauses.push(like(contacts.emailStatus, `%${opts.status}%`))
  }
  if (opts.company)  clauses.push(sql`LOWER(${contacts.company})  = LOWER(${opts.company})`)
  if (opts.location) clauses.push(sql`LOWER(${contacts.location}) = LOWER(${opts.location})`)
  if (opts.platform) clauses.push(sql`LOWER(${contacts.platform}) = LOWER(${opts.platform})`)
  const where = and(...clauses)
  const before = await db.select({ n: count() }).from(contacts).where(where)
  const n = Number(before[0]?.n ?? 0)
  if (n === 0) return 0
  await db.delete(contacts).where(where)
  return n
}

// Find rows with duplicate lowercased emails for the same user and remove
// all but the lowest-id (oldest) occurrence per email. Returns counters
// so the caller can report "X duplicates removed across Y emails".
export async function dedupeContacts(userId: string): Promise<{ removed: number; affectedEmails: number }> {
  const rows = await db
    .select({ id: contacts.id, email: contacts.recruiterEmail })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(asc(contacts.id))
  // Walk in id-ascending order; first occurrence of each lowercased
  // email wins, every later occurrence is queued for deletion.
  const seen = new Set<string>()
  const toDelete: number[] = []
  const affected = new Set<string>()
  for (const r of rows) {
    const key = String(r.email ?? '').trim().toLowerCase()
    if (!key) continue
    if (seen.has(key)) { toDelete.push(r.id); affected.add(key); continue }
    seen.add(key)
  }
  if (toDelete.length === 0) return { removed: 0, affectedEmails: 0 }
  // Chunked delete — `inArray` with thousands of ids generates a huge
  // SQL string; 500 per chunk keeps it safe across drivers.
  const CHUNK = 500
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const slice = toDelete.slice(i, i + CHUNK)
    await db.delete(contacts).where(and(eq(contacts.userId, userId), inArray(contacts.id, slice)))
  }
  return { removed: toDelete.length, affectedEmails: affected.size }
}

// Merge `add` and remove `remove` tags from each selected contact. Both
// arrays are normalized (lowercased, deduped) before being applied. We
// re-read each row instead of a single CASE because the dual-driver layer
// makes set arithmetic in SQL awkward and the N here is bounded by what
// the user could have selected on one page (<= 200).
export async function bulkTag(
  userId: string,
  ids: number[],
  add: string[] = [],
  remove: string[] = [],
) {
  const addN = new Set(normalizeTags(add.join(',')).split(',').filter(Boolean))
  const remN = new Set(normalizeTags(remove.join(',')).split(',').filter(Boolean))
  if (addN.size === 0 && remN.size === 0) return { updated: 0 }
  const rows = await db.select({ id: contacts.id, tags: contacts.tags }).from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, ids)))
  let updated = 0
  for (const r of rows) {
    const current = new Set((r.tags || '').split(',').filter(Boolean))
    for (const t of addN) current.add(t)
    for (const t of remN) current.delete(t)
    const next = Array.from(current).sort().join(',')
    if (next !== (r.tags || '')) {
      await db.update(contacts).set({ tags: next }).where(eq(contacts.id, r.id))
      updated++
    }
  }
  return { updated }
}

export async function recentContacts(userId: string, n: number) {
  return db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.id)).limit(n)
}
