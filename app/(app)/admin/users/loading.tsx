// Users tab skeleton — single big table.
export default function Loading() {
  return (
    <div className="rounded-md border bg-card">
      <div className="border-b p-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-muted/20" />
        ))}
      </div>
    </div>
  )
}
