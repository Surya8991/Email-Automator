// Wipes the SQLite file and re-runs migrations. Dev convenience only —
// refuses to run when NODE_ENV=production unless --force is passed.
//   npm run db:reset
import '../lib/env'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const force = process.argv.includes('--force')
if (process.env.NODE_ENV === 'production' && !force) {
  console.error('[reset-db] refusing in production. Re-run with --force to confirm.')
  process.exit(1)
}

const url = process.env.DATABASE_URL ?? './data/tracker.db'
if (url === ':memory:') { console.log('[reset-db] in-memory DB — nothing to reset'); process.exit(0) }
const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)

for (const suffix of ['', '-shm', '-wal']) {
  const f = dbPath + suffix
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('[reset-db] removed', f) }
}

execSync('npm run db:migrate', { stdio: 'inherit' })
console.log('[reset-db] done — fresh DB at', dbPath)
