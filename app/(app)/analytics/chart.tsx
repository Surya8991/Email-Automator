'use client'
import dynamic from 'next/dynamic'

export const Chart = dynamic(() => import('./chart-impl').then((m) => m.Chart), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-md bg-muted/30" />,
})
