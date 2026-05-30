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

const DT_FMT = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: APP_TZ,
})

export function formatDate(d: number | Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return DT_FMT.format(date)
}
