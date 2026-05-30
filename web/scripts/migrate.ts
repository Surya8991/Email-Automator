import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import fs from 'node:fs'

// Tiny .env loader — keeps the migrate script free of a dotenv dependency
// (Next.js loads .env automatically; only standalone scripts need this).
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadDotEnv(path.join(process.cwd(), '.env'))

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
