import { and, eq, desc } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { savedViews, type SavedView } from '@/server/db/schema'

// Saved-views service. Reads + writes the user's named filter combos.
// Tenancy: every query is userId-scoped; the scope column further
// separates contacts views from any future list page that adopts the
// same pattern.

export type SavedViewScope = 'contacts'

export async function listSavedViews(userId: string, scope: SavedViewScope): Promise<SavedView[]> {
  return db.select().from(savedViews)
    .where(and(eq(savedViews.userId, userId), eq(savedViews.scope, scope)))
    .orderBy(desc(savedViews.id))
}

export async function createSavedView(
  userId: string, scope: SavedViewScope, name: string, filters: Record<string, string>,
): Promise<SavedView> {
  // Clean the name + cap length. Filters are JSON-stringified; we only
  // accept primitive string values to keep the round-trip safe.
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) throw new Error('Name required')
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(filters)) {
    if (typeof k !== 'string' || typeof v !== 'string') continue
    if (!v) continue
    cleaned[k.slice(0, 40)] = v.slice(0, 400)
  }
  const inserted = await db.insert(savedViews).values({
    userId, scope, name: trimmed,
    filters: JSON.stringify(cleaned),
  }).returning()
  return inserted[0]!
}

export async function deleteSavedView(userId: string, id: number): Promise<void> {
  // userId guard inside WHERE so another user's id can't be deleted
  // even if leaked into the action call.
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.userId, userId)))
}
