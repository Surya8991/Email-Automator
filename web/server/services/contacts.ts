import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { contacts } from '@/server/db/schema'

export interface ListOpts { page?: number; pageSize?: number; search?: string; tag?: string }

export async function listContacts(userId: string, opts: ListOpts = {}) {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
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

export async function deleteContact(userId: string, id: number) {
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
}

export async function deleteContactsBulk(userId: string, ids: number[]) {
  for (const id of ids) await deleteContact(userId, id)
}

export async function recentContacts(userId: string, n: number) {
  return db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.id)).limit(n)
}
