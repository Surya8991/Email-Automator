// Queue tab skeleton — queue stats + active queue table + recent failures.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border bg-muted/30" />
        ))}
      </div>
      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    </div>
  )
}
