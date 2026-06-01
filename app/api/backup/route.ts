import { requireAdmin } from '@/auth'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'

// Whole-DB backup is ADMIN-ONLY — the file contains every user's contacts,
// templates, drafts, sessions, and events. A per-user logical export
// (contacts only) is at /api/contacts/export and stays open to every user.
// Every download writes an auditLog row so the cross-user audit view
// captures who downloaded and when — addresses H3 from the code review.
export async function GET() {
  const me = await requireAdmin()
  const url = process.env.DATABASE_URL ?? './data/tracker.db'
  const dbPath = path.isAbsolute(url) ? url : path.join(process.cwd(), url)
  if (!fs.existsSync(dbPath)) return new Response('No database', { status: 404 })
  const buf = fs.readFileSync(dbPath)
  // Best-effort audit. Don't block the download if the log insert fails.
  try {
    await db.insert(auditLog).values({
      userId: me.id, action: 'admin.download_backup',
      detail: `path=${path.basename(dbPath)} bytes=${buf.length}`, ip: '',
    })
  } catch { /* non-fatal */ }
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename=tracker_${Date.now()}.db`,
    },
  })
}
