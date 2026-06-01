/**
 * Auto-seed on first sign-in: ensureSeededTemplatesFor inserts any starter
 * keys the user is missing. Admin emails (ADMIN_EMAILS in env) additionally
 * receive the personalised overlay. Idempotent on re-runs.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import * as schema from '@/server/db/schema'

const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))

let onboarding: typeof import('@/server/services/onboarding')

const publicFile = path.join(process.cwd(), 'data', 'seed-templates.json')
const adminFile = path.join(process.cwd(), 'data', 'seed-templates.admin.json')
const seedAvailable = fs.existsSync(publicFile)
const publicCount = seedAvailable
  ? Object.keys(JSON.parse(fs.readFileSync(publicFile, 'utf8'))).length
  : 0
const adminCount = fs.existsSync(adminFile)
  ? Object.keys(JSON.parse(fs.readFileSync(adminFile, 'utf8'))).length
  : 0

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  onboarding = await import('@/server/services/onboarding')
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM templates').run()
  sqlite.prepare('DELETE FROM users').run()
})

async function makeUser(email?: string) {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: email ?? `${id}@x.co` })
  return id
}

describe('onboarding.ensureSeededTemplatesFor', () => {
  it.runIf(seedAvailable)('seeds only the public set for a non-admin user', async () => {
    const u = await makeUser('regular@x.co')
    await onboarding.ensureSeededTemplatesFor(u, 'regular@x.co')
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(publicCount)
  })

  it.runIf(seedAvailable && adminCount > 0)('seeds public + admin overlay for an admin email', async () => {
    const u = await makeUser('admin@x.co')
    await onboarding.ensureSeededTemplatesFor(u, 'admin@x.co')
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(publicCount + adminCount)
  })

  it.runIf(seedAvailable)('is admin-detection case-insensitive', async () => {
    const u = await makeUser('Admin@X.Co')
    await onboarding.ensureSeededTemplatesFor(u, 'Admin@X.Co')
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(publicCount + adminCount)
  })

  it.runIf(seedAvailable)('only fills missing keys, never duplicates', async () => {
    const u = await makeUser('regular@x.co')
    await onboarding.ensureSeededTemplatesFor(u, 'regular@x.co')
    await onboarding.ensureSeededTemplatesFor(u, 'regular@x.co')
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(publicCount)
  })

  it.runIf(seedAvailable && adminCount > 0)('backfills overlay if user is promoted to admin later', async () => {
    const u = await makeUser('admin@x.co')
    // Pretend they first signed in as a regular user (only public templates).
    await onboarding.ensureSeededTemplatesFor(u, 'someone-else@x.co')
    const before = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(before.length).toBe(publicCount)
    // Later visit as admin — overlay backfills.
    await onboarding.ensureSeededTemplatesFor(u, 'admin@x.co')
    const after = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(after.length).toBe(publicCount + adminCount)
  })

  it('leaves an existing custom key untouched', async () => {
    const u = await makeUser('regular@x.co')
    await db.insert(schema.templates).values({ userId: u, key: 'my_custom', subject: 's', initialMsg: 'b' })
    await onboarding.ensureSeededTemplatesFor(u, 'regular@x.co')
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    const custom = rows.find((r) => r.key === 'my_custom')
    expect(custom?.subject).toBe('s')
  })
})

describe('rate-limit', () => {
  it('caps the bucket at max', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    const key = 'test-key-' + crypto.randomUUID()
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(false) // 4th hit blocked
  })
})

declare const vi: typeof import('vitest')['vi']
