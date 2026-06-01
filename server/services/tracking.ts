import crypto from 'node:crypto'
import { env } from '@/lib/env'

// HMAC-signed token for an email_log row + kind. Prevents anyone outside
// the app from forging "open" or "click" events for arbitrary users.
function sign(payload: string): string {
  return crypto.createHmac('sha256', env.AUTH_SECRET).update(payload).digest('hex').slice(0, 16)
}

export function pixelUrl(emailLogId: number): string {
  const t = sign(`open:${emailLogId}`)
  return `${env.APP_URL.replace(/\/$/, '')}/api/track/open?eid=${emailLogId}&t=${t}`
}

export function clickUrl(emailLogId: number, target: string): string {
  const t = sign(`click:${emailLogId}:${target}`)
  return `${env.APP_URL.replace(/\/$/, '')}/api/track/click?eid=${emailLogId}&u=${encodeURIComponent(target)}&t=${t}`
}

export function verifyOpen(emailLogId: number, token: string): boolean {
  try { return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sign(`open:${emailLogId}`))) }
  catch { return false }
}

export function verifyClick(emailLogId: number, target: string, token: string): boolean {
  try { return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sign(`click:${emailLogId}:${target}`))) }
  catch { return false }
}

// Wrap an HTML body — inject the tracking pixel and rewrite every <a href>.
// Pixel is placed before </body> (or </html>) so it lands inside the document
// root, not after it — some clients (Gmail) drop content placed outside.
export function instrumentHtml(html: string, emailLogId: number): string {
  if (!html) return html
  // Compute our own host once so we can leave links to /api/unsubscribe,
  // /api/track/*, and other internal endpoints untouched. RFC 8058
  // one-click unsubscribe also doesn't tolerate a redirect hop — must
  // hit our domain directly. Skipping internal URLs is H6 from the
  // 2026-06-01 code review.
  let ownHost = ''
  try { ownHost = new URL(env.APP_URL).host.toLowerCase() } catch { /* default empty */ }
  const withClicks = html.replace(
    /<a\b([^>]*?)\bhref\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (_m, pre: string, url: string, post: string) => {
      // Don't rewrite mailto:, tel:, anchor (#), data:, or our own track URLs.
      if (!/^https?:\/\//i.test(url)) return `<a${pre} href="${url}"${post}>`
      // Internal URLs (same host) are never click-tracked. Catches
      // /api/unsubscribe (RFC 8058), /api/track/open, and any future
      // first-party deep links a template might embed.
      if (ownHost) {
        try {
          const targetHost = new URL(url).host.toLowerCase()
          if (targetHost === ownHost) return `<a${pre} href="${url}"${post}>`
        } catch { /* malformed — fall through and rewrite */ }
      }
      return `<a${pre} href="${clickUrl(emailLogId, url)}"${post}>`
    }
  )
  const pixel = `<img src="${pixelUrl(emailLogId)}" width="1" height="1" alt="" style="display:none;border:0;outline:none" />`
  if (/<\/body>/i.test(withClicks))      return withClicks.replace(/<\/body>/i, pixel + '</body>')
  if (/<\/html>/i.test(withClicks))      return withClicks.replace(/<\/html>/i, pixel + '</html>')
  return withClicks + pixel
}
