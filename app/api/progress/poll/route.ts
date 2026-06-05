// Polling fallback for /api/progress (SSE) — used on environments like
// Vercel where the emitter and the SSE consumer live in different Lambdas
// and the in-process Map fan-out doesn't reach the client. Returns the most
// recent event newer than `since` (unix-ms), or 204 if there's nothing.
import { requireUser } from '@/auth'
import { readLatest } from '@/server/sse'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = await requireUser()
  const userId = u.id
  const url = new URL(req.url)
  const since = Number(url.searchParams.get('since') ?? '0')
  const latest = await readLatest(userId, Number.isFinite(since) ? since : 0)
  if (!latest) return new Response(null, { status: 204 })
  return Response.json(latest)
}
