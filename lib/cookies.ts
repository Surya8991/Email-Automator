// Shared cookie helpers — secure-by-default attributes + HMAC-signed
// values for cookies whose contents must not be forgeable from DevTools.
//
// Why HMAC: `ea_impersonator` carries the admin's userId and gets read by
// `logAdmin` to attach a marker to audit rows. Without a signature, any
// user could open DevTools and plant `ea_impersonator=<another-admin-id>`
// to launder their own actions onto someone else's audit trail. Signing
// the value with AUTH_SECRET binds the cookie to a server-issued payload.
import { createHmac, timingSafeEqual } from 'node:crypto'

// Auto-detect HTTPS so `secure: true` is on in prod/preview but never
// on http://localhost — otherwise the browser drops the cookie and auth
// silently breaks in local dev.
export function isHttps(): boolean {
  if (process.env.NODE_ENV === 'production') return true
  if (process.env.VERCEL === '1') return true
  if ((process.env.APP_URL ?? '').startsWith('https://')) return true
  return false
}

// Cookie attribute set used for session-grade cookies. Callers spread it
// into the cookies().set() call and add their own { name, value, expires }.
export function sessionCookieAttrs() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: isHttps(),
    path: '/',
  }
}

function authSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET required for signed cookies')
  return s
}

// Produce `${payload}.${sig}` where sig = base64url(HMAC-SHA256(payload, AUTH_SECRET)).
// Self-contained — does not need a server-side session lookup to verify.
export function signCookieValue(payload: string): string {
  const sig = createHmac('sha256', authSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// Return the payload if the signature checks out, else null. Timing-safe
// comparison so an attacker can't measure how long verify takes to learn
// individual bytes of the signature.
export function verifyCookieValue(signed: string | undefined): string | null {
  if (!signed) return null
  const dot = signed.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = signed.slice(0, dot)
  const provided = signed.slice(dot + 1)
  const expected = createHmac('sha256', authSecret()).update(payload).digest('base64url')
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  try {
    return timingSafeEqual(a, b) ? payload : null
  } catch {
    return null
  }
}
