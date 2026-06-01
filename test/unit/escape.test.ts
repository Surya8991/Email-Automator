import { describe, it, expect } from 'vitest'
import { htmlEscape, stripCrlf, assertNoCrlf, personalize, sanitizeUnsubText } from '@/lib/escape'

describe('htmlEscape', () => {
  it('encodes the five HTML metacharacters', () => {
    expect(htmlEscape(`<a "b" 'c' & d>`)).toBe('&lt;a &quot;b&quot; &#39;c&#39; &amp; d&gt;')
  })
  it('coerces non-strings safely', () => {
    expect(htmlEscape(null)).toBe('')
    expect(htmlEscape(undefined)).toBe('')
    expect(htmlEscape(42)).toBe('42')
  })
})

describe('stripCrlf', () => {
  it('collapses CR/LF runs to single spaces and trims', () => {
    expect(stripCrlf('a\r\nb\nc')).toBe('a b c')
  })
})

describe('assertNoCrlf', () => {
  it('throws on CR or LF', () => {
    expect(() => assertNoCrlf('to', 'x@y\n')).toThrow(/Header injection/)
    expect(() => assertNoCrlf('to', 'x@y')).not.toThrow()
  })
})

describe('personalize', () => {
  it('escapes values in html mode', () => {
    const out = personalize('Hi {{name}}!', { name: '<img src=x>' }, 'html')
    expect(out).toBe('Hi &lt;img src=x&gt;!')
  })
  it('strips newlines in subject mode', () => {
    expect(personalize('Hi {{name}}', { name: 'a\nb' }, 'subject')).toBe('Hi a b')
  })
  it('passes values through in text mode', () => {
    expect(personalize('Hi {{name}}', { name: '<x>' }, 'text')).toBe('Hi <x>')
  })
  it('handles missing values', () => {
    expect(personalize('Hi {{nope}}', {}, 'html')).toBe('Hi ')
  })
  it('uses |fallback when value is missing or empty', () => {
    expect(personalize('Hi {{name|there}}', {}, 'html')).toBe('Hi there')
    expect(personalize('Hi {{name|there}}', { name: '' }, 'html')).toBe('Hi there')
    expect(personalize('Hi {{name|there}}', { name: '   ' }, 'html')).toBe('Hi there')
    expect(personalize('Hi {{name|there}}', { name: 'Priya' }, 'html')).toBe('Hi Priya')
  })
  it('fallback also applies in subject mode', () => {
    expect(personalize('Re: {{company|your team}}', {}, 'subject')).toBe('Re: your team')
  })
})

describe('sanitizeUnsubText', () => {
  it('drops <script> entirely', () => {
    expect(sanitizeUnsubText('a<script>x</script>b')).toBe('ab')
  })
  it('keeps the safe-tag whitelist', () => {
    const out = sanitizeUnsubText('Hi <b>there</b><br><i>!</i>')
    expect(out).toBe('Hi <b>there</b><br><i>!</i>')
  })
  it('strips on* event handlers from surviving tags', () => {
    const out = sanitizeUnsubText('<b onclick="x()">hi</b>')
    expect(out).toBe('<b>hi</b>')
  })
  it('rewrites <a> to keep only http/mailto hrefs', () => {
    expect(sanitizeUnsubText('<a href="https://x.co">y</a>')).toBe('<a href="https://x.co">y</a>')
    expect(sanitizeUnsubText('<a href="javascript:alert(1)">y</a>')).toBe('y</a>')
  })
})
