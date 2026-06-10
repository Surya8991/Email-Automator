// Long-running worker process — calls the shared tickOnce() every 30 s.
// The same tick lives in server/services/scheduler-tick.ts and is also used
// by app/api/cron/tick/route.ts on Vercel. Keeps the two surfaces in lock-step.
// .env loading is handled inside lib/env.ts itself so it runs before zod parses.
import '../lib/env'
import { tickOnce } from '../server/services/scheduler-tick'
import { logger } from '../lib/logger'

const TICK_MS = 30_000
const log = logger.child({ component: 'worker' })

async function loop() {
  try {
    const r = await tickOnce()
    if (r.sent || r.failed || r.advanced) log.info({ ...r }, 'tick')
    else log.debug({ ...r }, 'tick (idle)')
  } catch (err) {
    log.error({ err }, 'tick threw')
  }
}

// Surface anything the try/catch in loop() can't reach (module-load errors,
// promises detached from the loop) so silent crashes are visible in logs.
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'unhandledRejection')
})
process.on('uncaughtException', (err) => {
  log.error({ err }, 'uncaughtException')
})

log.info({ tickMs: TICK_MS }, 'scheduler started')
void loop()
setInterval(loop, TICK_MS)
