import { describe, it, expect } from 'vitest'
import { stripHtml, fetchForAi, buildMessages } from '@/server/services/ai-generate'

describe('ai-generate.stripHtml', () => {
  it('removes scripts and styles', () => {
    const html = '<html><head><style>.x{}</style></head><body><script>alert(1)</script><p>Hello</p></body></html>'
    const out = stripHtml(html)
    expect(out).toContain('Hello')
    expect(out).not.toMatch(/alert/)
    expect(out).not.toMatch(/\.x\{/)
  })
  it('decodes common entities', () => {
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(stripHtml('Q&amp;A: 1 &lt; 2')).toBe('Q&A: 1 < 2')
  })
  it('preserves paragraph breaks as newlines', () => {
    expect(stripHtml('<p>First.</p><p>Second.</p>')).toMatch(/First\.\s*Second\./)
  })
})

describe('ai-generate.fetchForAi (SSRF defenses)', () => {
  it('rejects non-http(s) protocols', async () => {
    expect(await fetchForAi('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(await fetchForAi('file:///etc/passwd')).toMatchObject({ ok: false })
    expect(await fetchForAi('ftp://example.com')).toMatchObject({ ok: false })
  })
  it('rejects invalid URLs', async () => {
    expect(await fetchForAi('not-a-url')).toMatchObject({ ok: false })
    expect(await fetchForAi('')).toMatchObject({ ok: false })
  })
  it('rejects private IPv4 ranges (SSRF)', async () => {
    expect(await fetchForAi('http://127.0.0.1/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://10.0.0.5/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://192.168.1.1/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://172.16.0.1/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://169.254.169.254/latest/meta-data/')).toMatchObject({ ok: false })
  })
  it('rejects localhost-style hostnames', async () => {
    expect(await fetchForAi('http://localhost/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://app.internal/x')).toMatchObject({ ok: false })
    expect(await fetchForAi('http://api.local/x')).toMatchObject({ ok: false })
  })
  it('rejects IPv6 loopback and link-local', async () => {
    expect(await fetchForAi('http://[::1]/x')).toMatchObject({ ok: false })
  })
})

describe('ai-generate.buildMessages (prompt builder)', () => {
  it('always emits system + user messages', () => {
    const msgs = buildMessages({ kind: 'jd', input: 'x' }, 'Source content', '')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]?.role).toBe('system')
    expect(msgs[1]?.role).toBe('user')
  })
  it('omits brand voice section when blank', () => {
    const msgs = buildMessages({ kind: 'jd', input: 'x' }, 'Source content', '')
    expect(msgs[1]?.content).not.toMatch(/Writing samples/i)
  })
  it('includes brand voice section when set', () => {
    const msgs = buildMessages({ kind: 'jd', input: 'x' }, 'Source content', 'I write punchy.')
    expect(msgs[1]?.content).toMatch(/Writing samples/i)
    expect(msgs[1]?.content).toMatch(/I write punchy\./)
  })
  it('omits recipient section when no fields provided', () => {
    const msgs = buildMessages({ kind: 'text', input: 'x' }, 'Source', '')
    expect(msgs[1]?.content).not.toMatch(/Recipient context/i)
  })
  it('includes recipient section when name/role/company set', () => {
    const msgs = buildMessages({
      kind: 'text', input: 'x',
      recipient: { name: 'Jane', role: 'PM', company: 'Acme' },
    }, 'Source', '')
    expect(msgs[1]?.content).toMatch(/Recipient context/)
    expect(msgs[1]?.content).toMatch(/Jane/)
    expect(msgs[1]?.content).toMatch(/Role: PM/)
    expect(msgs[1]?.content).toMatch(/Company: Acme/)
  })
  it('system includes length + CTA hints when requested', () => {
    const sys = buildMessages({ kind: 'text', input: 'x', length: 'short', cta: 'direct' }, 'Source', '')[0]?.content ?? ''
    expect(sys).toMatch(/under 80 words/i)
    expect(sys).toMatch(/Direct CTA/i)
  })
  it('truncates source to keep prompt bounded', () => {
    const huge = 'A'.repeat(20_000)
    const msgs = buildMessages({ kind: 'text', input: 'x' }, huge, '')
    // The prompt should not contain the entire 20k blob.
    expect(msgs[1]?.content.length).toBeLessThan(15_000)
  })
})
