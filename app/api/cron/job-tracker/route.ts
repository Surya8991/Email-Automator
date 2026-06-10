import { tickAll } from '@/server/services/job-tracker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Cron endpoint that walks the active job sources and pulls new
// leads. Hardened the same way as /api/cron/tick:
//   - Requires CRON_SECRET in production (Vercel / NODE_ENV=production)
//   - In local dev (no VERCEL, no production NODE_ENV) it stays open so
//     `curl http://localhost:3000/api/cron/job-tracker` works for testing
//   - Returns a compact JSON summary so the GitHub Actions log surfaces
//     per-tick stats

async function unauthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return true
    return false
  }
  const url = new URL(req.url)
  if (url.searchParams.get('secret') === secret) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth.replace(/^Bearer\s+/i, '') === secret) return false
  return true
}

export async function GET(req: Request) {
  if (await unauthorized(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const start = Date.now()
  try {
    // Lowered from 40 → 20: each tickSource does an external fetch +
    // (sometimes) an AI extraction. 40 sources × 3-10s easily exceeds the
    // Vercel 60s function budget. With tickAll's bounded concurrency this
    // still scans 4× per wall-clock second.
    const r = await tickAll(20)
    return Response.json({ ok: true, ...r, ms: Date.now() - start })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tick failed'
    console.error('[cron/job-tracker] fatal:', e)
    return Response.json({ ok: false, error: msg, ms: Date.now() - start }, { status: 500 })
  }
}
