// Long-running worker process — calls the shared tickOnce() every 30 s.
// The same tick lives in server/services/scheduler-tick.ts and is also used
// by app/api/cron/tick/route.ts on Vercel. Keeps the two surfaces in lock-step.
// .env loading is handled inside lib/env.ts itself so it runs before zod parses.
import '../lib/env'
import { tickOnce } from '../server/services/scheduler-tick'

const TICK_MS = 30_000

async function loop() {
  try {
    const r = await tickOnce()
    if (r.sent || r.failed || r.advanced) {
      console.log(`[worker] sent=${r.sent} failed=${r.failed} advanced=${r.advanced} users=${r.users}`)
    }
  } catch (err) {
    console.error('[worker] tick threw', err)
  }
}

console.log('[worker] scheduler started, tick every', TICK_MS, 'ms')
loop()
setInterval(loop, TICK_MS)
