import { requireAdmin } from '@/auth'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'

// Whole-DB backup is ADMIN-ONLY — the file contains every user's contacts,
// templates, drafts, sessions, and events. A per-user logical export
// (contacts only) is at /api/contacts/export and stays open to every user.
// Every download writes an auditLog row so the cross-user audit view
// captures who downloaded and when.
export async function GET() {
  const me = await requireAdmin()
  const dbUrl = process.env.DATABASE_URL ?? './data/tracker.db'
  // Backup only works for local SQLite files. Turso/libSQL deployments use a
  // remote URL and have no local file to stream — return a clear 501 rather
  // than silently serving the wrong path or returning 404.
  if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')) {
    return new Response(
      'Backup is not available for remote (Turso/libSQL) deployments. Use the Turso dashboard to export.',
      { status: 501 },
    )
  }
  const dbPath = path.isAbsolute(dbUrl) ? dbUrl : path.join(process.cwd(), dbUrl)
  if (!fs.existsSync(dbPath)) return new Response('No database file found', { status: 404 })
  const stat = fs.statSync(dbPath)
  // Best-effort audit before streaming so the record exists even if the
  // client disconnects mid-download.
  try {
    await db.insert(auditLog).values({
      userId: me.id, action: 'admin.download_backup',
      detail: `path=${path.basename(dbPath)} bytes=${stat.size}`, ip: '',
    })
  } catch { /* non-fatal */ }
  // Stream the file rather than reading it all into memory — avoids OOM on
  // large databases and keeps the event loop unblocked.
  const nodeStream = fs.createReadStream(dbPath)
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
      ))
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', (err) => controller.error(err))
    },
    cancel() { nodeStream.destroy() },
  })
  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename=tracker_${Date.now()}.db`,
      'Content-Length': String(stat.size),
    },
  })
}
