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

export interface CreatedKey { id: number; raw: string; prefix: string; name: string }

export async function createKey(userId: string, name: string): Promise<CreatedKey> {
  const raw = generateRawKey()
  const prefix = raw.slice(0, 11) // "ea_" + first 8 chars
  const ins = await db.insert(apiKeys).values({
    userId, name, keyHash: hashKey(raw), prefix,
  }).returning({ id: apiKeys.id })
  return { id: ins[0]!.id, raw, prefix, name }
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
  return row.userId
}
