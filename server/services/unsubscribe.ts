import crypto from 'node:crypto'
import { env } from '@/lib/env'

// HMAC-signed token, matches the v1 scheme: HMAC-SHA256 of the lowercase
// email truncated to 32 hex chars. AUTH_SECRET is the key (same secret
// Auth.js uses for session encryption — kills the "two secrets" footgun).
export function unsubToken(email: string): string {
  return crypto.createHmac('sha256', env.AUTH_SECRET)
    .update(String(email).toLowerCase()).digest('hex').slice(0, 32)
}

export function unsubUrl(email: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/unsubscribe?e=${encodeURIComponent(String(email).toLowerCase())}&t=${unsubToken(email)}`
}

export function verifyToken(email: string, token: string): boolean {
  if (!email || !token) return false
  const expected = unsubToken(email)
  try { return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)) }
  catch { return false }
}
