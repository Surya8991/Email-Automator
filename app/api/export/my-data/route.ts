import { requireUser } from '@/auth'
import { buildUserExport } from '@/server/services/export'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'

/**
 * GDPR-style "give me all my data" endpoint. Returns a JSON file
 * (`Email-Automator-export-<date>.json`) containing one entry per
 * user-owned table.
 *
 * Why GET not server-action: we want a direct download via an <a>
 * link, and Next server-actions can't stream a file response with a
 * custom filename. A route handler is the natural fit.
 *
 * Rate-limit: 1 per 24h per user. The export touches every table the
 * user owns, so a tight cap is the right default. A second hit
 * returns 429; an op can lift this for a specific user if needed by
 * clearing the bucket on restart.
 *
 * Auth: requireUser() throws redirect for unauthenticated callers.
 * Multi-tenant safety is enforced inside buildUserExport() — every
 * SELECT is scoped by userId.
 */
export async function GET() {
  const u = await requireUser()
  if (!rateLimit(`export-my-data:${u.id}`, 1, 24 * 60 * 60_000)) {
    return new Response(JSON.stringify({ error: 'Already exported within the last 24 h. Try again tomorrow.' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
  }
  const payload = await buildUserExport(u.id, u.email)
  const filename = `Email-Automator-export-${new Date().toISOString().slice(0, 10)}.json`
  // Audit so the operator can prove (e.g. to a privacy team) that the
  // user did self-serve and we didn't dump their data ourselves.
  try {
    await db.insert(auditLog).values({
      userId: u.id, action: 'gdpr.export',
      detail: JSON.stringify({ tables: payload.manifest.tables, schemaVersion: payload.manifest.schemaVersion }),
      ip: '',
    })
  } catch (e) { console.error('[export] auditLog insert failed:', e) }
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store, private',
    },
  })
}
