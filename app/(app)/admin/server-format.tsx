'use client'
import { useFormatDate } from '@/components/timezone-provider'

// Thin client wrapper around useFormatDate() so server pages can render
// timestamps in the user's TZ without needing a `'use client'` directive
// on the whole page.
export function ServerFormat({ at }: { at: string | number | Date | null | undefined }) {
  const fmt = useFormatDate()
  return <>{fmt(at)}</>
}
