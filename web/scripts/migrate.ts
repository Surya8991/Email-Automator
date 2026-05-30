import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import fs from 'node:fs'

const url = process.env.DATABASE_URL ?? './data/tracker.db'
const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite)
migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
console.log('[db] migrated:', dbPath)
sqlite.close()
