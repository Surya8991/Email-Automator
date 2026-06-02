import crypto from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { apiKeys, type ApiKey } from '@/server/db/schema'

// `ea_` makes the keys identifiable in log scans (similar to `gsk_` / `sk-`).
// 32 random bytes → 43 chars URL-safe base64.
function generateRawKey(): string {
  return 'ea_' + crypto.randomBytes(32).toString('base64url')
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export interface CreatedKey { id: number; raw: string; prefix: string; name: string; scopes: string }

/**
 * Create a new API key. `scopes` is a comma-separated list (e.g.
 * "read:contacts,write:contacts"). Pass empty string to mean "all scopes"
 * — matches the back-compat behavior of pre-0004 keys.
 */
export async function createKey(userId: string, name: string, scopes = 'read:contacts,write:contacts'): Promise<CreatedKey> {
  const raw = generateRawKey()
  const prefix = raw.slice(0, 11) // "ea_" + first 8 chars
  const cleanScopes = scopes.split(',').map((s) => s.trim()).filter(Boolean).join(',')
  const ins = await db.insert(apiKeys).values({
    userId, name, keyHash: hashKey(raw), prefix, scopes: cleanScopes,
  }).returning({ id: apiKeys.id })
  return { id: ins[0]!.id, raw, prefix, name, scopes: cleanScopes }
}

export async function listKeys(userId: string): Promise<ApiKey[]> {
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.id))
}

export async function revokeKey(userId: string, id: number): Promise<void> {
  await db.update(apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
}

/** Look up a key by raw token. Returns null if not found, revoked, or wrong. */
export async function userIdFromKey(raw: string): Promise<string | null> {
  const r = await userIdAndScopesFromKey(raw)
  return r ? r.userId : null
}

/** Look up a key and its scopes. Empty `scopes` = "all" (back-compat). */
export async function userIdAndScopesFromKey(raw: string): Promise<{ userId: string; scopes: string } | null> {
  if (!raw || !raw.startsWith('ea_')) return null
  const rows = await db.select().from(apiKeys).where(and(
    eq(apiKeys.keyHash, hashKey(raw)),
    isNull(apiKeys.revokedAt),
  ))
  const row = rows[0]
  if (!row) return null
  // Update lastUsedAt opportunistically — non-blocking is fine, but the
  // strict-mode requires we await it. The cost is one fast UPDATE per call.
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id))
  return { userId: row.userId, scopes: row.scopes ?? '' }
}
