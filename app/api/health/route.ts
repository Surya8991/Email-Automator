// Lightweight health probe for uptime monitors + load-balancer health checks.
// Returns 200 with a small JSON payload on success, 503 if the DB is
// unreachable. No auth — must be safe for unauthenticated probes.
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  try {
    // Smallest possible DB probe — runs against whichever driver is active.
    await db.run(sql`SELECT 1`)
    return Response.json({
      ok: true,
      ts: start,
      dbMs: Date.now() - start,
    })
  } catch (err) {
    return Response.json({
      ok: false,
      ts: start,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 503 })
  }
}
