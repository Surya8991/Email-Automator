export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border bg-muted/30" />
        ))}
      </div>
      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="h-5 w-44 animate-pulse rounded bg-muted/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    </div>
  )
}
