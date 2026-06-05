// System tab skeleton — DB card + quota usage + blocklist + campaigns
// (heavy multi-card page).
export default function Loading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-md border bg-card p-4">
          <div className="h-5 w-44 animate-pulse rounded bg-muted/40" />
          <div className="h-32 animate-pulse rounded bg-muted/30" />
        </div>
      ))}
    </div>
  )
}
