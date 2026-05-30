import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDate(d: number | Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  return date.toLocaleString()
}
