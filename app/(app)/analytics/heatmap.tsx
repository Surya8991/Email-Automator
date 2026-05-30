// Send-time heatmap. 7-row (Sun→Sat) × 24-col (0-23 hr IST) grid; cell
// shade scales with send count, with the open % shown on hover. Plain
// CSS grid + Tailwind — no chart lib needed for a 168-cell render.
//
// Server returns counts already bucketed against IST so the grid reads
// naturally for the user without TZ math on the client.

interface Cell { dow: number; hour: number; sent: number; opens: number }

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function Heatmap({ cells }: { cells: Cell[] }) {
  const maxSent = Math.max(1, ...cells.map((c) => c.sent))
  // Map (dow, hour) → Cell for O(1) lookup; the server returns the full
  // 168-cell grid so this is just an indexing concern.
  const lookup = new Map<string, Cell>(cells.map((c) => [`${c.dow}:${c.hour}`, c]))

  // Pick a cell tint based on intensity (0..1). Tailwind doesn't generate
  // dynamic class names so we use inline rgba for the bg.
  function tint(sent: number): string {
    if (sent === 0) return 'rgba(120,120,140,0.06)'
    const ratio = sent / maxSent
    const alpha = 0.15 + ratio * 0.75
    return `rgba(37, 99, 235, ${alpha.toFixed(2)})` // primary blue
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[10px] tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card p-1 text-right text-muted-foreground"></th>
            {HOURS.map((h) => (
              <th key={h} className="p-1 text-center font-normal text-muted-foreground">
                {h % 3 === 0 ? `${h.toString().padStart(2, '0')}` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOW_LABELS.map((label, dow) => (
            <tr key={dow}>
              <td className="sticky left-0 bg-card p-1 pr-2 text-right font-medium text-muted-foreground">{label}</td>
              {HOURS.map((h) => {
                const c = lookup.get(`${dow}:${h}`) ?? { dow, hour: h, sent: 0, opens: 0 }
                const openPct = c.sent > 0 ? Math.round((c.opens / c.sent) * 100) : 0
                return (
                  <td key={h} className="p-0">
                    <div
                      className="h-6 w-6 rounded"
                      style={{ background: tint(c.sent) }}
                      title={`${label} ${h.toString().padStart(2, '0')}:00 IST · ${c.sent} sent · ${openPct}% open`}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Hours are IST. Cell shade scales with send count over the last 30 days;
        hover for sent + open-rate.
      </p>
    </div>
  )
}
