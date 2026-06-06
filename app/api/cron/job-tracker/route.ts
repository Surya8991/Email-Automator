import { tickAll } from '@/server/services/job-tracker'
import { env } from '@/lib/env'

// Cron endpoint that walks the active job sources and pulls new
// leads. Hardened the same way as /api/cron/tick:
//   - Requires CRON_SECRET via `?secret=` or `Authorization: Bearer`
//   - Times out (bounded by Vercel function limit anyway)
//   - Returns a compact JSON summary
//
// Suggested cron schedule: every hour. Each tick caps the source
// scan at 40 to keep Vercel function duration safe.

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return Response.json({ error: 'CRON_SECRET not set' }, { status: 503 })
  }
  const url = new URL(req.url)
  const provided = url.searchParams.get('secret') ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided !== env.CRON_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await tickAll(40)
    // Always 200 so the GitHub Actions workflow doesn't fail on source-level
    // errors (those are recorded per-row in job_sources.last_error).
    return Response.json({ ok: true, ...r })
  } catch (e) {
    // Only fatal errors reach here (e.g. DB unreachable). Log + 500 so
    // GitHub Actions marks the run as failed and the operator notices.
    const msg = e instanceof Error ? e.message : 'tick failed'
    console.error('[cron/job-tracker] fatal:', e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
