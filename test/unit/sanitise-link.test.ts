import { describe, it, expect } from 'vitest'
import { sanitiseLink } from '@/server/services/job-adapters/utils'

describe('sanitiseLink', () => {
  const SRC = 'https://boards.greenhouse.io/airbnb'

  it('returns empty string when link is empty', () => {
    expect(sanitiseLink('', SRC)).toBe('')
  })

  it('resolves a relative link against the source URL', () => {
    expect(sanitiseLink('/jobs/12345', SRC)).toBe('https://boards.greenhouse.io/jobs/12345')
  })

  it('rejects non-http(s) schemes', () => {
    expect(sanitiseLink('javascript:alert(1)', SRC)).toBe('')
    expect(sanitiseLink('mailto:hr@acme.com', SRC)).toBe('')
    expect(sanitiseLink('data:text/html,<h1>x', SRC)).toBe('')
  })

  it('rejects same-as-source URL (search-page-as-link)', () => {
    expect(sanitiseLink(SRC, SRC)).toBe('')
  })

  it('strips utm_* tracking params', () => {
    const r = sanitiseLink('https://boards.greenhouse.io/airbnb/jobs/123?utm_source=indeed&utm_medium=cpc', SRC)
    expect(r).toBe('https://boards.greenhouse.io/airbnb/jobs/123')
  })

  it('strips gclid + fbclid', () => {
    const r = sanitiseLink('https://acme.com/job?gclid=abc&fbclid=xyz', SRC)
    expect(r).toBe('https://acme.com/job')
  })

  it('strips lever-source + gh_src referral params', () => {
    const r = sanitiseLink('https://jobs.lever.co/co/123?lever-source=indeed', SRC)
    expect(r).toBe('https://jobs.lever.co/co/123')
  })

  it('preserves job-id params (gh_jid, q, id)', () => {
    const r = sanitiseLink('https://boards.greenhouse.io/airbnb/jobs/123?gh_jid=999&utm_source=x', SRC)
    expect(r).toBe('https://boards.greenhouse.io/airbnb/jobs/123?gh_jid=999')
  })

  it('caps length at 600 chars', () => {
    const long = 'https://acme.com/' + 'x'.repeat(800)
    expect(sanitiseLink(long, SRC).length).toBeLessThanOrEqual(600)
  })

  it('handles absolute http upgrade implicitly', () => {
    // http stays http (no opinion in sanitiseLink — it's the SSRF guard's job)
    const r = sanitiseLink('http://acme.com/job/1', SRC)
    expect(r).toBe('http://acme.com/job/1')
  })

  it('resolves loose text as a relative path against source', () => {
    // "foo" with a valid source URL is a legal relative path, so URL
    // constructor resolves it — sanitiseLink hands it back as absolute.
    const r = sanitiseLink('jobs/role/123', SRC)
    expect(r).toContain('boards.greenhouse.io')
  })
})
