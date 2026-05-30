import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { templates, type Template } from '@/server/db/schema'

export async function listTemplates(userId: string): Promise<Template[]> {
  return db.select().from(templates).where(eq(templates.userId, userId))
}

export async function getActive(userId: string): Promise<Template | null> {
  const rows = await db.select().from(templates).where(and(eq(templates.userId, userId), eq(templates.active, true)))
  return rows[0] ?? null
}

export async function upsertTemplate(userId: string, key: string, patch: Partial<Template>): Promise<Template> {
  const existing = await db.select().from(templates).where(and(eq(templates.userId, userId), eq(templates.key, key)))
  if (existing[0]) {
    await db.update(templates).set({
      ...patch,
      version: (existing[0].version ?? 1) + 1,
      updatedAt: new Date(),
    }).where(eq(templates.id, existing[0].id))
    const [row] = await db.select().from(templates).where(eq(templates.id, existing[0].id))
    return row!
  }
  const inserted = await db.insert(templates).values({
    userId,
    key,
    label: patch.label ?? '',
    category: patch.category ?? '',
    subject: patch.subject ?? '',
    initialMsg: patch.initialMsg ?? '',
    follow1Msg: patch.follow1Msg ?? '',
    lastFollowMsg: patch.lastFollowMsg ?? '',
    active: patch.active ?? false,
  }).returning()
  return inserted[0]!
}

// Activate exactly one template per user — atomic single UPDATE. Computes
// each row's `active` value in one go so concurrent activate() calls can
// never leave the user with two active templates or briefly with none.
export async function activate(userId: string, id: number) {
  await db.update(templates)
    .set({ active: sql`CASE WHEN ${templates.id} = ${id} THEN 1 ELSE 0 END` })
    .where(eq(templates.userId, userId))
}

// True iff the user owns the given template — used to gate cross-tenant
// references (e.g. campaign steps).
export async function userOwnsTemplate(userId: string, id: number): Promise<boolean> {
  const rows = await db.select({ id: templates.id }).from(templates)
    .where(and(eq(templates.userId, userId), eq(templates.id, id)))
  return rows.length > 0
}
