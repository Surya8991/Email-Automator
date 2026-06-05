import { describe, it, expect } from 'vitest'
import { validateUrlForFetch } from '@/server/services/ai-generate'

// Mirrors test/unit/ai-generate.test.ts (which covers the fetcher) —
// this file isolates the shape-only validator that addJobSourceAction
// uses so a real-world HTTP 403/404 from a hostile board UA doesn't
// gate adding the source.

describe('validateUrlForFetch (URL shape + SSRF only — no fetch)', () => {
  it('accepts ordinary https URLs', () => {
    expect(validateUrlForFetch('https://www.naukri.com/marketing-jobs-in-bangalore')).toMatchObject({ ok: true })
    expect(validateUrlForFetch('https://www.foundit.in/srp/results?query=SEO')).toMatchObject({ ok: true })
  })
  it('strips embedded credentials', () => {
    const r = validateUrlForFetch('https://user:pass@example.com/path')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).not.toContain('user:pass')
  })
  it('rejects non-http(s) protocols', () => {
    expect(validateUrlForFetch('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('file:///etc/passwd')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('ftp://example.com')).toMatchObject({ ok: false })
  })
  it('rejects garbage', () => {
    expect(validateUrlForFetch('not-a-url')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('')).toMatchObject({ ok: false })
  })
  it('rejects private IPv4 (SSRF defense)', () => {
    expect(validateUrlForFetch('http://127.0.0.1/x')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('http://10.0.0.5/x')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('http://169.254.169.254/latest/meta-data/')).toMatchObject({ ok: false })
  })
  it('rejects localhost-style hostnames', () => {
    expect(validateUrlForFetch('http://localhost/x')).toMatchObject({ ok: false })
    expect(validateUrlForFetch('http://app.internal/x')).toMatchObject({ ok: false })
  })
  it('returns the cleaned URL string on success', () => {
    const r = validateUrlForFetch('https://example.com/path?q=1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toMatch(/^https:\/\/example\.com\/path/)
  })
})
