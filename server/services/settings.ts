import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'

export async function getSetting(userId: string, key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(and(eq(settings.userId, userId), eq(settings.key, key)))
  return rows[0]?.value ?? null
}

export async function setSetting(userId: string, key: string, value: string): Promise<void> {
  const existing = await db.select().from(settings).where(and(eq(settings.userId, userId), eq(settings.key, key)))
  if (existing[0]) {
    await db.update(settings).set({ value }).where(and(eq(settings.userId, userId), eq(settings.key, key)))
  } else {
    await db.insert(settings).values({ userId, key, value })
  }
}

export async function getMany(userId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = await getSetting(userId, k)
    if (v !== null) out[k] = v
  }
  return out
}
