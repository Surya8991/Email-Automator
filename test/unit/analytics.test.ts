import { describe, it, expect } from 'vitest'

// A trivial guard test that exercises the per-rate math used in the dashboard
// without spinning up the DB. Mirrors the formula in services/analytics.ts.

function rate(part: number, whole: number) { return whole ? part / whole : 0 }

describe('analytics rate math', () => {
  it('returns zero for empty denominators', () => {
    expect(rate(5, 0)).toBe(0)
  })
  it('returns the proportion otherwise', () => {
    expect(rate(3, 12)).toBe(0.25)
  })
})
