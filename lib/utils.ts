import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// India Standard Time — the app is operated from IST so we render all
// user-facing timestamps in IST regardless of where Vercel runs the
// serverless function (it's usually UTC). Used by every UI surface and
// every server-side status string written into the DB.
export const APP_TZ = 'Asia/Kolkata'

// Cache one DateTimeFormat per timezone — Intl.DateTimeFormat is cheap to
// reuse and expensive to construct. The default IST formatter is hot;
// other timezones get lazily created when a user opts in.
const FMT_CACHE = new Map<string, Intl.DateTimeFormat>()
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = FMT_CACHE.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz })
    FMT_CACHE.set(tz, f)
  }
  return f
}

/**
 * Format a timestamp in the given timezone (defaults to IST). Used by the
 * client formatter hook and by server code that composes status strings.
 */
export function formatDate(d: number | Date | string | null | undefined, tz: string = APP_TZ): string {
  if (!d) return '—'
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  try { return fmtFor(tz).format(date) }
  catch { return fmtFor(APP_TZ).format(date) } // invalid tz string → fall back
}
