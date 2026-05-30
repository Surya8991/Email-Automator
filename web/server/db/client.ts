import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import * as schema from './schema'

const url = process.env.DATABASE_URL ?? './data/tracker.db'
// `:memory:` is a sentinel that better-sqlite3 routes to an in-process DB —
// we must NOT join it with cwd.
const inMemory = url === ':memory:'
const dbPath = inMemory ? ':memory:' : (path.isAbsolute(url) ? url : path.join(process.cwd(), url))

if (!inMemory) {
  // Ensure directory exists — better-sqlite3 doesn't create parents.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

// WAL gives us concurrent readers + a single writer with no blocking on the
// reader side. NORMAL sync drops fsync per-tx in exchange for crash-tolerance
// only at the last few ms of writes — fine for this workload. (WAL is a no-op
// on :memory: but the pragma call is harmless.)
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
export { schema }
