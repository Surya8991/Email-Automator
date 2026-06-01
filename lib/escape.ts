// Identical fixes to Phase 1's standalone/template-engine.js — but typed,
// re-exported as TS, and re-tested under Vitest so the v2 surface inherits
// the same hardening that the v1 final cut shipped with.

export function htmlEscape(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripCrlf(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/[\r\n]+/g, ' ').trim()
}

export function assertNoCrlf(name: string, s: unknown): asserts s is string {
  if (typeof s === 'string' && /[\r\n]/.test(s)) {
    throw new Error(`Header injection: CR/LF in ${name}`)
  }
}

// Supports {{var}} and {{var|fallback}}. Fallback kicks in when the value
// is null, undefined, or an empty/whitespace string — so a CSV row missing
// `name` renders "Hi there," instead of "Hi ,".
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\|\s*([^}]*?))?\s*\}\}/g

/**
 * Replace {{var}} (and {{var|fallback}}) placeholders in `template`.
 *   - mode 'subject' → values are CRLF-stripped (header safety)
 *   - mode 'html'    → values are HTML-escaped (XSS safety in email body)
 *   - mode 'text'    → no escaping (use only for plain-text bodies)
 */
export function personalize(template: string, data: Record<string, unknown>, mode: 'subject' | 'html' | 'text' = 'html'): string {
  if (!template) return ''
  return template.replace(PLACEHOLDER_RE, (_, key, fallback) => {
    let raw = data[key]
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      raw = fallback ?? ''
    }
    if (mode === 'subject') return stripCrlf(raw)
    if (mode === 'text') return raw === null || raw === undefined ? '' : String(raw)
    return htmlEscape(raw)
  })
}

const SAFE_TAGS = new Set(['a', 'b', 'i', 'em', 'strong', 'br'])

export function sanitizeUnsubText(s: string | null | undefined): string {
  if (!s) return ''
  let out = String(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag: string) => {
    const t = tag.toLowerCase()
    if (!SAFE_TAGS.has(t)) return ''
    if (t === 'a') {
      if (/^<\/a/i.test(m)) return '</a>'
      const hrefMatch = m.match(/\bhref\s*=\s*["']([^"']*)["']/i)
      const href = hrefMatch?.[1] ?? ''
      if (/^(https?:|mailto:)/i.test(href)) return `<a href="${href.replace(/"/g, '&quot;')}">`
      return ''
    }
    return m.startsWith('</') ? `</${t}>` : `<${t}>`
  })
  return out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
}
