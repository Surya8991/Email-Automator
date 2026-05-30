// Gmail API helpers. Reads the user's Google OAuth tokens from the
// accounts table (Auth.js DrizzleAdapter stores them per provider).
// Auto-refreshes the access_token when expired using the refresh_token.
// All calls fail loudly if the user signed in via magic link instead of
// Google — Gmail features need the OAuth scope grant.

import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { accounts } from '@/server/db/schema'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const log = logger.child({ component: 'google' })

interface TokenSet {
  access_token: string
  refresh_token: string | null
  expires_at: number | null // epoch seconds
}

async function fetchTokensRow(userId: string): Promise<TokenSet | null> {
  const rows = await db.select().from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
  const row = rows[0]
  if (!row || !row.access_token) return null
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token ?? null,
    expires_at: row.expires_at ?? null,
  }
}

async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  if (!res.ok) {
    log.warn({ status: res.status }, 'google token refresh failed')
    return null
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  const expiresAt = json.expires_in ? Math.floor(Date.now() / 1000) + json.expires_in : null
  await db.update(accounts).set({
    access_token: json.access_token,
    expires_at: expiresAt,
  }).where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
  return json.access_token
}

/**
 * Returns a usable access_token for the user's Google account. Refreshes
 * it if it's expired (or within 60 s of expiry). Returns null if the user
 * isn't signed in via Google or the refresh fails — and logs the cause
 * so a "Gmail features stopped working" report is debuggable.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const t = await fetchTokensRow(userId)
  if (!t) {
    log.warn({ userId }, 'no google account on file — user signed in via magic-link?')
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  const expiringSoon = t.expires_at !== null && t.expires_at - now < 60
  if (!expiringSoon) return t.access_token
  if (!t.refresh_token) {
    // Happens when the user revoked consent in their Google account, or
    // when a previous OAuth flow didn't grant offline access. They need
    // to sign out + sign in again to re-grant.
    log.warn({ userId }, 'google access_token expired and no refresh_token — user must re-auth')
    return null
  }
  const refreshed = await refreshAccessToken(userId, t.refresh_token)
  if (!refreshed) log.warn({ userId }, 'google token refresh returned null — user must re-auth')
  return refreshed
}

interface GmailResponse { data?: unknown; status: number }
async function gmail(userId: string, urlSuffix: string): Promise<GmailResponse> {
  const token = await getGoogleAccessToken(userId)
  if (!token) throw new Error('No Google access token. Sign in with Google to use Gmail features.')
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${urlSuffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: res.status, data: res.ok ? await res.json() : undefined }
}

/** Pull the user's primary Gmail signature (HTML). */
export async function fetchGmailSignature(userId: string): Promise<string> {
  const r = await gmail(userId, '/users/me/settings/sendAs')
  if (r.status !== 200 || !r.data) throw new Error(`Gmail sendAs ${r.status}`)
  const list = (r.data as { sendAs?: Array<{ isDefault?: boolean; isPrimary?: boolean; signature?: string }> }).sendAs ?? []
  const primary = list.find((x) => x.isDefault || x.isPrimary) ?? list[0]
  return primary?.signature ?? ''
}

interface GmailMessageListItem { id: string }
interface GmailMessageList { messages?: GmailMessageListItem[]; resultSizeEstimate?: number }

/** Search Gmail. q follows the Gmail search syntax (e.g. 'from:x in:sent'). */
async function gmailSearch(userId: string, q: string, max = 50): Promise<string[]> {
  const r = await gmail(userId, `/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`)
  if (r.status !== 200 || !r.data) return []
  return ((r.data as GmailMessageList).messages ?? []).map((m) => m.id)
}

/** For each email in `emails`, check if there's any inbox reply. Returns
 *  the set of emails that have replied. */
export async function detectReplies(userId: string, emails: string[]): Promise<Set<string>> {
  const replied = new Set<string>()
  // Cap concurrency to be polite to Gmail's quota.
  for (const e of emails) {
    try {
      const ids = await gmailSearch(userId, `from:${e} in:inbox`, 1)
      if (ids.length > 0) replied.add(e.toLowerCase())
    } catch { /* skip */ }
  }
  return replied
}

/** Pull mailer-daemon bounces from Gmail; return the bounced recipient set
 *  by sniffing the snippet for an email-looking address. */
export async function detectBounces(userId: string): Promise<Set<string>> {
  const bounced = new Set<string>()
  for (const q of ['from:mailer-daemon', 'from:postmaster subject:Undeliverable']) {
    try {
      const ids = await gmailSearch(userId, q, 30)
      for (const id of ids) {
        const r = await gmail(userId, `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject`)
        if (r.status !== 200 || !r.data) continue
        const snippet = (r.data as { snippet?: string }).snippet ?? ''
        const matches = snippet.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)
        if (matches) for (const m of matches) {
          const lc = m.toLowerCase()
          if (!lc.includes('mailer-daemon') && !lc.includes('postmaster')) bounced.add(lc)
        }
      }
    } catch { /* skip */ }
  }
  return bounced
}
