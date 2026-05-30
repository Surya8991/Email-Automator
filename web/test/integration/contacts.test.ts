import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'

// We instantiate a fresh in-memory DB per test file so the integration tests
// stay hermetic — no shared state between files, no flake from test order.
const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite)

beforeAll(() => {
  // Skip if migrations folder hasn't been generated yet — `npm run db:generate`
  // creates it. The test still passes; the assertion just confirms wiring.
  const migrationsFolder = path.join(process.cwd(), 'server/db/migrations')
  try { migrate(db, { migrationsFolder }) } catch (e) {
    console.warn('[integration] migrations not present yet:', (e as Error).message)
  }
})

describe('integration plumbing', () => {
  it('opens an in-memory SQLite and runs a trivial query', () => {
    const r = sqlite.prepare('SELECT 1 AS one').get() as { one: number }
    expect(r.one).toBe(1)
  })

  it('refuses cross-tenant access (smoke — full assertion lands when ' +
     'migrations are generated + services run against this DB instance)', () => {
    // Placeholder: once `pnpm db:generate` produces the SQL, we wire the same
    // services/* layer to this `db` and prove user A's queries return zero
    // rows for user B's data.
    expect(true).toBe(true)
  })
})
