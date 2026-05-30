// Applies Drizzle migrations from server/db/migrations.
// Picks the driver from DATABASE_URL shape:
//   libsql:// or http(s)://  →  libSQL (Turso) — async migrate
//   anything else            →  better-sqlite3 — sync migrate
// Same eager-import-of-lib/env trick the worker uses so .env is loaded
// before zod parses.
import '../lib/env'
import path from 'node:path'
import fs from 'node:fs'

const url = process.env.DATABASE_URL ?? './data/tracker.db'
const isLibsql = /^(libsql:|https?:|file:)/i.test(url)
const migrationsFolder = path.join(process.cwd(), 'server/db/migrations')

async function main() {
  if (isLibsql) {
    const { createClient } = await import('@libsql/client')
    const { drizzle } = await import('drizzle-orm/libsql')
    const { migrate } = await import('drizzle-orm/libsql/migrator')
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
    const db = drizzle(client)
    await migrate(db, { migrationsFolder })
    console.log('[db] migrated (libsql):', url)
    return
  }

  const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)
  if (url !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder })
  console.log('[db] migrated (better-sqlite3):', dbPath)
  sqlite.close()
}

main().catch((e) => { console.error('[migrate]', e); process.exit(1) })
