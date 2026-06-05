import { describe, it, expect } from 'vitest'
import { fingerprintOf, keywordsMatch } from '@/server/services/job-tracker'

describe('job-tracker.fingerprintOf', () => {
  it('lowercases + trims for stable dedupe', () => {
    expect(fingerprintOf('  Senior PM  ', 'Acme')).toBe(fingerprintOf('senior pm', 'acme'))
    expect(fingerprintOf('Senior PM', 'Acme Inc')).toBe(fingerprintOf('SENIOR PM', '  acme   inc'))
  })
  it('collapses internal whitespace runs', () => {
    expect(fingerprintOf('Senior   Product   Manager', 'Acme')).toBe('senior product manager|acme')
  })
  it('different titles or companies produce different fingerprints', () => {
    expect(fingerprintOf('PM', 'A')).not.toBe(fingerprintOf('PM', 'B'))
    expect(fingerprintOf('PM I', 'A')).not.toBe(fingerprintOf('PM II', 'A'))
  })
})

describe('job-tracker.keywordsMatch', () => {
  it('empty keywords match everything', () => {
    expect(keywordsMatch('Anything', 'Acme', '')).toBe(true)
    expect(keywordsMatch('Anything', 'Acme', '   ')).toBe(true)
  })
  it('matches a keyword in the title (case insensitive)', () => {
    expect(keywordsMatch('Senior Product Manager', 'Acme', 'product')).toBe(true)
    expect(keywordsMatch('Senior Product Manager', 'Acme', 'PRODUCT')).toBe(true)
  })
  it('matches a keyword in the company', () => {
    expect(keywordsMatch('Engineer', 'Stripe', 'stripe, square')).toBe(true)
  })
  it('rejects when no keyword matches', () => {
    expect(keywordsMatch('Designer', 'Acme', 'product, growth')).toBe(false)
  })
  it('handles whitespace + empty entries in the keyword list', () => {
    expect(keywordsMatch('Designer', 'Acme', ' , , designer , ')).toBe(true)
    expect(keywordsMatch('Designer', 'Acme', ', , ,')).toBe(true) // no real keywords → match all
  })
})
