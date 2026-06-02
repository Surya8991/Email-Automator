import { logger } from './logger'

const log = logger.child({ component: 'action' })

// Messages that look like driver/internal leaks — never return raw to the
// client. Caught patterns: libSQL/SQLite, Postgres SQLSTATE, Drizzle stack
// hints, "at <stack>" lines, file paths.
const LEAK_PATTERNS = [
  /SQLITE_/i,
  /LibsqlError/i,
  /SQLite3 Error/i,
  /no such column|no such table/i,
  /UNIQUE constraint failed/i,
  /FOREIGN KEY constraint/i,
  /\bSQLSTATE\b/i,
  /\bER_[A-Z_]+/,
  /\bat\s+[A-Za-z_$][\w$.]*\s+\(/, // stack-frame line
  /[A-Z]:\\|\/(?:home|Users|var)\//,
]

function looksLikeLeak(msg: string): boolean {
  return LEAK_PATTERNS.some((p) => p.test(msg))
}

/**
 * Use inside server-action catch blocks instead of returning raw `e.message`.
 * Logs the full error server-side (with stack), and returns a sanitized
 * string for the client: the original message if it looks safe to surface
 * (a deliberate `throw new Error('No active template')` from a service),
 * or the fallback when it smells like a driver / internal leak.
 */
export function actionError(e: unknown, fallback: string, ctx?: Record<string, unknown>): { error: string } {
  log.warn({ err: e, ...ctx }, fallback)
  if (e instanceof Error && !looksLikeLeak(e.message)) {
    return { error: e.message }
  }
  return { error: fallback }
}
