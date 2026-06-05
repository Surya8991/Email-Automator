'use client'

interface Cell { dow: number; hour: number; n: number }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function FailureHeatmap({ grid }: { grid: Cell[] }) {
  const max = grid.reduce((m, c) => Math.max(m, c.n), 0)
  const intensity = (n: number) => (max === 0 ? 0 : n / max)
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-0.5 font-normal text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, dow) => (
            <tr key={dow}>
              <th className="pr-1 text-right font-normal text-muted-foreground">{day}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = grid.find((c) => c.dow === dow && c.hour === h)
                const n = cell?.n ?? 0
                const i = intensity(n)
                const bg = i === 0 ? 'transparent' : `rgba(239, 68, 68, ${0.15 + i * 0.7})`
                return (
                  <td key={h} className="border border-border/40"
                    style={{ width: 16, height: 16, background: bg }}
                    title={`${day} ${h}:00 — ${n} failure${n === 1 ? '' : 's'}`} />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
