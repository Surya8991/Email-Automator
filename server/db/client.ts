// Dual-driver Drizzle client. Picks the right driver from DATABASE_URL shape:
//   - libsql:// or http(s)://  →  @libsql/client (works on Vercel; Turso DBs)
//   - anything else            →  better-sqlite3 (local file or :memory: for tests)
//
// Both branches expose the same query API surface, so service code is
// driver-agnostic. We don't use db.transaction() anywhere (better-sqlite3 is
// sync there, libSQL is async) — atomic ops use single CASE-WHEN UPDATEs
// or rely on UNIQUE constraints + try/catch.
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'

// We need synchronous `require()` to pick a driver at module-load time.
// CommonJS (how Next.js bundles this) provides it as a global; pure ESM
// (how tsx loads our CLI scripts via "type": "module") doesn't.
// createRequire gives us sync require in both worlds.
//
// turbopackIgnore tells Next 16's Turbopack NOT to try to statically trace
// what's behind the require() at build time — we pick the driver at runtime
// based on DATABASE_URL, and Turbopack would otherwise bundle BOTH drivers
// into every server function, bloating the deploy and breaking Vercel
// serverless because better-sqlite3 is a native module.
const require = createRequire(/* turbopackIgnore: true */ import.meta.url)

const url = process.env.DATABASE_URL ?? './data/tracker.db'
// Anything that looks like a URL (libsql://, https://, file:) goes through
// the libSQL driver — that's the modern Turso wire format. Bare paths
// (./data/tracker.db, /var/lib/...) go through better-sqlite3.
const isLibsql = /^(libsql:|https?:|file:)/i.test(url)

// Build the driver synchronously at module-load time. We use require() so
// Webpack can statically include only the driver we need at build time when
// `serverExternalPackages` is configured in next.config.
let db: BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>

if (isLibsql) {
  // ─── libSQL / Turso ────────────────────────────────────────────────
  const { createClient } = require('@libsql/client') as typeof import('@libsql/client')
  const { drizzle } = require('drizzle-orm/libsql') as typeof import('drizzle-orm/libsql')
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  db = drizzle(client, { schema }) as unknown as typeof db
} else {
  // ─── better-sqlite3 (local file or :memory:) ───────────────────────
  const inMemory = url === ':memory:'
  const dbPath = inMemory ? ':memory:' : (path.isAbsolute(url) ? url : path.join(process.cwd(), url))
  if (!inMemory) fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const { drizzle } = require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')   // no-op on :memory:; harmless
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema }) as unknown as typeof db
}

export { db, schema }
export type DB = typeof db
