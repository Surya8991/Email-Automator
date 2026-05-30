import { NextResponse } from 'next/server'
import { tickOnce } from '@/server/services/scheduler-tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel cron target — runs every minute via vercel.json. Same one-pass tick
// the worker process uses. Protect with CRON_SECRET; Vercel sets the
// Authorization: Bearer header automatically when configured.
async function unauthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // no secret configured → open (don't enable in prod without one)
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
