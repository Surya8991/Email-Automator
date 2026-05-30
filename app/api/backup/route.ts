import { requireAdmin } from '@/auth'
import fs from 'node:fs'
import path from 'node:path'

// Whole-DB backup is ADMIN-ONLY — the file contains every user's contacts,
// templates, drafts, sessions, and events. A per-user logical export
// (contacts only) is at /api/contacts/export and stays open to every user.
export async function GET() {
  await requireAdmin()
  const url = process.env.DATABASE_URL ?? './data/tracker.db'
  const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)
  if (!fs.existsSync(dbPath)) return new Response('No database', { status: 404 })
  const buf = fs.readFileSync(dbPath)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename=tracker_${Date.now()}.db`,
    },
  })
}
