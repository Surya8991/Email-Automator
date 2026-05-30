'use client'
import { createContext, useContext, useMemo } from 'react'
import { APP_TZ, formatDate as formatDateRaw } from '@/lib/utils'

// Per-user timezone for *client-rendered* timestamps. Server-rendered
// strings that get snapshotted into DB (contacts.emailStatus, etc.) keep
// their format from the moment of write — changing TZ later doesn't
// rewrite history. APP_TZ (IST) is the fallback for unauthenticated
// pages and for any provider-less render path.
const TimezoneContext = createContext<string>(APP_TZ)

export function TimezoneProvider({ tz, children }: { tz: string; children: React.ReactNode }) {
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
}

/**
 * Returns a formatter bound to the user's preferred timezone.
 *
 *   const fmt = useFormatDate()
 *   <td>{fmt(row.createdAt)}</td>
 */
export function useFormatDate(): (d: number | Date | string | null | undefined) => string {
  const tz = useContext(TimezoneContext)
  return useMemo(() => (d) => formatDateRaw(d, tz), [tz])
}

export function useTimezone(): string {
  return useContext(TimezoneContext)
}
