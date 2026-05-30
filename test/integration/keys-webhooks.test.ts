/**
 * API keys + webhooks integration tests. Same pattern as the other suites —
 * in-memory SQLite with the production migrations applied.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import path from 'node:path'
import * as schema from '@/server/db/schema'

const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))

let keys: typeof import('@/server/services/api-keys')
let hooks: typeof import('@/server/services/webhooks')

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  keys = await import('@/server/services/api-keys')
  hooks = await import('@/server/services/webhooks')
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM api_keys').run()
  sqlite.prepare('DELETE FROM webhooks').run()
  sqlite.prepare('DELETE FROM users').run()
})

async function makeUser() {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${id}@x.co` })
  return id
}

describe('api keys', () => {
  it('createKey returns plaintext; userIdFromKey resolves it back', async () => {
    const u = await makeUser()
    const k = await keys.createKey(u, 'CI test key')
    expect(k.raw).toMatch(/^ea_/)
    expect(k.prefix).toBe(k.raw.slice(0, 11))
    const resolved = await keys.userIdFromKey(k.raw)
    expect(resolved).toBe(u)
  })

  it('stores only the hash, never the plaintext', async () => {
    const u = await makeUser()
    const k = await keys.createKey(u, 'k')
    const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, u))
    expect(rows[0]!.keyHash).not.toBe(k.raw)
    expect(rows[0]!.keyHash).toHaveLength(64) // sha256 hex
  })

  it('revoked keys do not resolve', async () => {
    const u = await makeUser()
    const k = await keys.createKey(u, 'k')
    await keys.revokeKey(u, k.id)
    expect(await keys.userIdFromKey(k.raw)).toBeNull()
  })

  it('rejects malformed or unknown keys', async () => {
    expect(await keys.userIdFromKey('')).toBeNull()
    expect(await keys.userIdFromKey('not-our-prefix')).toBeNull()
    expect(await keys.userIdFromKey('ea_doesnotexist')).toBeNull()
  })

  it('user A cannot revoke user B\'s key', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const k = await keys.createKey(a, 'a-key')
    await keys.revokeKey(b, k.id) // wrong user — should be a no-op
    expect(await keys.userIdFromKey(k.raw)).toBe(a) // still valid
  })
})

describe('webhooks', () => {
  it('createWebhook generates a fresh 32-byte secret per row', async () => {
    const u = await makeUser()
    const w1 = await hooks.createWebhook(u, { url: 'https://a.co/x' })
    const w2 = await hooks.createWebhook(u, { url: 'https://a.co/y' })
    expect(w1.secret).not.toBe(w2.secret)
    expect(w1.secret.length).toBeGreaterThan(40) // base64url 32 bytes ≈ 43 chars
  })

  it('dispatch hits only subscribers that requested the event kind', async () => {
    const u = await makeUser()
    const hits: Array<{ url: string; sig: string; body: string }> = []
    const origFetch = global.fetch
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const headers = init?.headers as Record<string, string>
      hits.push({ url, sig: headers['X-EA-Signature'] || '', body: String(init?.body ?? '') })
      return new Response('ok', { status: 200 })
    }) as typeof global.fetch
    try {
      await hooks.createWebhook(u, { url: 'https://opens.example/', events: 'open' })
      await hooks.createWebhook(u, { url: 'https://all.example/', events: 'sent,open,click' })
      await hooks.dispatch(u, 'open', { foo: 1 })
      expect(hits.map((h) => h.url).sort()).toEqual(['https://all.example/', 'https://opens.example/'])
      // Both should carry an HMAC sig (hex of sha256 → 64 chars)
      expect(hits[0]!.sig).toHaveLength(64)
    } finally {
      global.fetch = origFetch
    }
  })

  it('failed deliveries record lastStatus and lastError without throwing', async () => {
    const u = await makeUser()
    const origFetch = global.fetch
    global.fetch = (async () => { throw new Error('connection refused') }) as typeof global.fetch
    try {
      const w = await hooks.createWebhook(u, { url: 'https://nope.example/', events: 'sent' })
      await hooks.dispatch(u, 'sent', { ok: false })
      const [row] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, w.id))
      expect(row!.lastStatus).toBe(0)
      expect(row!.lastError).toMatch(/connection refused/)
    } finally {
      global.fetch = origFetch
    }
  })
})

declare const vi: typeof import('vitest')['vi']
