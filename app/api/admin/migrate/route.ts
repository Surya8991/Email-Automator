/**
 * POST /api/admin/migrate
 * Admin-only endpoint that runs pending Drizzle migrations against the
 * configured DATABASE_URL. Useful when the production Turso DB is behind
 * the current schema version and the operator cannot run `npm run db:migrate`
 * from a terminal (e.g. deployed on Vercel with no SSH access).
 *
 * Security: requires an active admin session (requireAdmin throws 401/403
 * for non-admins). One application per minute per user (rate-limited).
 *
 * Usage:
 *   fetch('/api/admin/migrate', { method: 'POST' })
 *   → { ok: true, applied: 2 }    // migrations newly applied
 *   → { ok: true, applied: 0 }    // already up-to-date
 *   → { ok: false, error: '…' }   // something went wrong
 */
import path from 'node:path'
import { requireAdmin } from '@/auth'

let lastRun = 0
const RATE_MS = 60_000  // 1 per minute

export async function POST() {
  await requireAdmin()

  const now = Date.now()
  if (now - lastRun < RATE_MS) {
    return Response.json({ ok: false, error: 'Rate limited — wait 60 s between migration runs' }, { status: 429 })
  }
  lastRun = now

  try {
    const url = process.env.DATABASE_URL ?? './data/tracker.db'
    const isLibsql = /^(libsql:|https?:|file:)/i.test(url)
    const migrationsFolder = path.join(process.cwd(), 'server/db/migrations')

    if (isLibsql) {
      const { createClient } = await import('@libsql/client')
      const { drizzle } = await import('drizzle-orm/libsql')
      const { migrate } = await import('drizzle-orm/libsql/migrator')
      const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
      const db = drizzle(client)
      await migrate(db, { migrationsFolder })
      await client.close()
    } else {
      const Database = (await import('better-sqlite3')).default
      const { drizzle } = await import('drizzle-orm/better-sqlite3')
      const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
      const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)
      const sqlite = new Database(dbPath)
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('foreign_keys = ON')
      const db = drizzle(sqlite)
      migrate(db, { migrationsFolder })
      sqlite.close()
    }

    return Response.json({ ok: true, message: 'Migrations applied (or already up-to-date)' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin/migrate]', e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
