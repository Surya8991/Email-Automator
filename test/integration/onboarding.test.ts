/**
 * Auto-seed on first sign-in: ensureSeededTemplatesFor populates the 20
 * starter templates only for users who have zero templates. Idempotent on
 * subsequent calls.
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

const seedFile = path.join(process.cwd(), 'data', 'seed-templates.json')
const seedAvailable = fs.existsSync(seedFile)

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  onboarding = await import('@/server/services/onboarding')
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM templates').run()
  sqlite.prepare('DELETE FROM users').run()
})

async function makeUser() {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${id}@x.co` })
  return id
}

describe('onboarding.ensureSeededTemplatesFor', () => {
  it.runIf(seedAvailable)('seeds 20 starter templates on first call', async () => {
    const u = await makeUser()
    await onboarding.ensureSeededTemplatesFor(u)
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(20)
  })
  it('is a no-op when the user already has templates', async () => {
    const u = await makeUser()
    await db.insert(schema.templates).values({ userId: u, key: 'existing', subject: 's', initialMsg: 'b' })
    await onboarding.ensureSeededTemplatesFor(u)
    const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    expect(rows.length).toBe(1) // unchanged
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
