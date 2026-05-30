/**
 * Pins the per-user-credentials behavior:
 *   - per-user setting wins over env
 *   - env is the fallback
 *   - 'none' source if neither is set
 *   - tenant isolation: u1's key cannot leak into u2's reads
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import * as schema from '@/server/db/schema'

const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))

let creds: typeof import('@/server/services/credentials')
let settingsSvc: typeof import('@/server/services/settings')

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  creds = await import('@/server/services/credentials')
  settingsSvc = await import('@/server/services/settings')
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM settings').run()
  sqlite.prepare('DELETE FROM users').run()
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  delete process.env.GROQ_API_KEY
})

async function makeUser(tag: string) {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${tag}-${id}@x.co` })
  return id
}

describe('getSmtpFor', () => {
  it('returns "none" when nothing is set anywhere', async () => {
    const u = await makeUser('s1')
    const r = await creds.getSmtpFor(u)
    expect(r.source).toBe('none')
  })
  it('falls back to env when no per-user creds', async () => {
    process.env.SMTP_USER = 'env@x.co'
    process.env.SMTP_PASS = 'env-pass'
    const u = await makeUser('s2')
    const r = await creds.getSmtpFor(u)
    expect(r.source).toBe('env')
    expect(r.user).toBe('env@x.co')
  })
  it('per-user creds beat env', async () => {
    process.env.SMTP_USER = 'env@x.co'
    process.env.SMTP_PASS = 'env-pass'
    const u = await makeUser('s3')
    await settingsSvc.setSetting(u, 'SMTP_USER', 'mine@x.co')
    await settingsSvc.setSetting(u, 'SMTP_PASS', 'mine-pass')
    const r = await creds.getSmtpFor(u)
    expect(r.source).toBe('user')
    expect(r.user).toBe('mine@x.co')
  })
  it('per-user creds do not leak into a second user', async () => {
    const u1 = await makeUser('a')
    const u2 = await makeUser('b')
    await settingsSvc.setSetting(u1, 'SMTP_USER', 'a@x.co')
    await settingsSvc.setSetting(u1, 'SMTP_PASS', 'a-pass')
    const r2 = await creds.getSmtpFor(u2)
    expect(r2.source).toBe('none')
  })
})

describe('getAiFor', () => {
  it('per-user GROQ_API_KEY beats env', async () => {
    process.env.GROQ_API_KEY = 'env-key'
    const u = await makeUser('ai1')
    await settingsSvc.setSetting(u, 'GROQ_API_KEY', 'my-key')
    const r = await creds.getAiFor(u)
    expect(r.source).toBe('user')
    expect(r.apiKey).toBe('my-key')
  })
  it('returns "none" when neither user nor env has a key', async () => {
    const u = await makeUser('ai2')
    const r = await creds.getAiFor(u)
    expect(r.source).toBe('none')
  })
})

declare const vi: typeof import('vitest')['vi']
