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
  // POSIX / Node.js syscall errors: ENOENT, ECONNREFUSED, ETIMEDOUT, etc.
  /\bE[A-Z]{2,}\b/,
  // Container / cloud paths not caught by the Windows/home pattern above
  /\/(?:proc|run|etc|tmp|sys|app|opt)\//,
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
 *
 * Special-case for the most common operator footgun: when a write hits a
 * table that hasn't been migrated yet, we substitute a clear, actionable
 * message instead of the leak-scrubbed generic. The "Add failed" was true
 * but useless — the user couldn't tell that the fix is a DB migration.
 */
export function actionError(e: unknown, fallback: string, ctx?: Record<string, unknown>): { error: string } {
  log.warn({ err: e, ...ctx }, fallback)
  if (isSchemaMissingError(e)) {
    return { error: 'Database is missing a required table. The operator needs to apply the latest migrations (see OPERATOR_TODO.html § 1).' }
  }
  if (e instanceof Error && !looksLikeLeak(e.message)) {
    return { error: e.message }
  }
  return { error: fallback }
}

/**
 * True iff the error looks like "no such table" / "no such column" / a
 * libsql equivalent. Exported so /jobs (and similar pages added later)
 * can render an above-the-fold banner that tells the operator what to do.
 */
export function isSchemaMissingError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  // Covers:
  //   SQLite:   "no such table: X" / "no such column: X"
  //   libsql:   "SqliteError: table X has no column named Y"
  //   libsql:   "SQLITE_ERROR no such table/column"
  //   Drizzle:  "column X is missing" (rare, generated during schema mapping)
  return /no such table|no such column|has no column named|SQLITE_ERROR.*no such|column.*is missing/i.test(e.message)
}
