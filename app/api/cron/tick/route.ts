import { NextResponse } from 'next/server'
import { tickOnce } from '@/server/services/scheduler-tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron target — runs the same one-pass tick as the worker process.
// On the Hobby plan, Vercel cron is rate-limited to once/day, so we drive
// this from GitHub Actions (.github/workflows/cron-tick.yml) every 5 minutes
// instead. The Action sends `Authorization: Bearer $CRON_SECRET`.
// Without CRON_SECRET set, this route is open — guard it in any prod deploy.
async function unauthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // In production, require the secret — failing open lets anyone trigger
    // mass email sends on behalf of all users.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return true
    // Local dev: no secret = open (curl http://localhost:3000/api/cron/tick).
    return false
  }
  const url = new URL(req.url)
  if (url.searchParams.get('secret') === secret) return false
  if ((req.headers.get('authorization') || '') === `Bearer ${secret}`) return false
  return true
}

export async function GET(req: Request) {
  if (await unauthorized(req)) return new NextResponse('Unauthorized', { status: 401 })
  const start = Date.now()
  const stats = await tickOnce()
  return NextResponse.json({ ok: true, ...stats, ms: Date.now() - start })
}
