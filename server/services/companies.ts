// B1 Company Research — per-user company enrichment store.
//
// The contacts.company column is free-form text (CSV imports vary). We
// don't FK to it; instead we resolve by case-insensitive name match in
// this service. One row per (user, company-name).
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { companies } from '@/server/db/schema'

export interface CompanyInput {
  name: string
  industry?: string
  hq?: string
  size?: string
  funding?: string
  glassdoor?: string
  techStack?: string
  salaryRange?: string
  hiringFreq?: string
  notes?: string
  sourceUrl?: string
}

export async function listCompanies(userId: string) {
  return db.select().from(companies)
    .where(eq(companies.userId, userId))
    .orderBy(asc(companies.name))
}

export async function getCompanyByName(userId: string, name: string) {
  const clean = name.trim()
  if (!clean) return null
  const [row] = await db.select().from(companies)
    .where(and(eq(companies.userId, userId), sql`LOWER(${companies.name}) = ${clean.toLowerCase()}`))
    .limit(1)
  return row ?? null
}

export async function getCompany(userId: string, id: number) {
  const [row] = await db.select().from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .limit(1)
  return row ?? null
}

export async function upsertCompany(userId: string, input: CompanyInput) {
  const clean = input.name.trim()
  if (!clean) throw new Error('Company name required')
  const existing = await getCompanyByName(userId, clean)
  const now = Date.now()
  const data = {
    industry: input.industry ?? '', hq: input.hq ?? '',
    size: input.size ?? '', funding: input.funding ?? '',
    glassdoor: input.glassdoor ?? '', techStack: input.techStack ?? '',
    salaryRange: input.salaryRange ?? '', hiringFreq: input.hiringFreq ?? '',
    notes: input.notes ?? '', sourceUrl: input.sourceUrl ?? '',
    updatedAt: now,
  }
  if (existing) {
    await db.update(companies).set(data).where(eq(companies.id, existing.id))
    return existing.id
  }
  const ins = await db.insert(companies)
    .values({ userId, name: clean, ...data, createdAt: now })
    .returning({ id: companies.id })
  return ins[0]!.id
}

export async function deleteCompany(userId: string, id: number) {
  await db.delete(companies).where(and(eq(companies.userId, userId), eq(companies.id, id)))
}

// Bulk seed from a CSV-like array. Idempotent — re-runs overwrite existing rows.
export async function bulkUpsertCompanies(userId: string, rows: CompanyInput[]) {
  let added = 0, updated = 0
  for (const r of rows) {
    if (!r.name?.trim()) continue
    const existed = await getCompanyByName(userId, r.name)
    await upsertCompany(userId, r)
    if (existed) updated++; else added++
  }
  return { added, updated }
}
