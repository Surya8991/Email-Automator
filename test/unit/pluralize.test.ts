import { describe, it, expect } from 'vitest'
import { pluralize, pluralWord, formatCount } from '@/lib/pluralize'

describe('pluralize', () => {
  it('singular for n=1', () => {
    expect(pluralize(1, 'draft')).toBe('1 draft')
    expect(pluralize(1, 'company', 'companies')).toBe('1 company')
  })
  it('plural for n=0 (zero is plural in English)', () => {
    expect(pluralize(0, 'draft')).toBe('0 drafts')
    expect(pluralize(0, 'company', 'companies')).toBe('0 companies')
  })
  it('plural for n>1', () => {
    expect(pluralize(42, 'contact')).toBe('42 contacts')
    expect(pluralize(2, 'company', 'companies')).toBe('2 companies')
  })
  it('negative still pluralizes', () => {
    // Edge case — shouldn't happen but shouldn't crash.
    expect(pluralize(-1, 'draft')).toBe('-1 drafts')
  })
  it('falls back to <singular>+s when plural omitted', () => {
    expect(pluralize(7, 'tag')).toBe('7 tags')
  })
})

describe('pluralWord', () => {
  it('returns the word only', () => {
    expect(pluralWord(1, 'contact')).toBe('contact')
    expect(pluralWord(2, 'contact')).toBe('contacts')
    expect(pluralWord(0, 'company', 'companies')).toBe('companies')
  })
})

describe('formatCount', () => {
  it('uses thousands separators for large counts', () => {
    expect(formatCount(1234, 'send')).toBe('1,234 sends')
    expect(formatCount(1, 'send')).toBe('1 send')
  })
})
