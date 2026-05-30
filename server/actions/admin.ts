'use server'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { adminEmails } from '@/lib/env'

export async function deleteUserAction(userId: string) {
  const me = await requireAdmin()
  if (userId === me.id) return { error: "You can't delete yourself" }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  if (adminEmails.includes((target.email ?? '').toLowerCase())) return { error: "Can't delete another admin from the UI" }
  // Cascading FKs handle contacts/templates/drafts/etc — see schema.ts.
  await db.delete(users).where(eq(users.id, userId))
  revalidatePath('/admin')
  return { ok: true }
}

// Soft-suspend a user. Reuses the per-user SENDS_PAUSED setting that
// scheduler-tick already honors, so a suspended user's queue stops
// without losing data. Their session keeps working — they can sign in,
// view their data, even add contacts — but the worker won't send
// anything until an admin un-suspends them.
import { setSetting, getSetting } from '@/server/services/settings'

export async function suspendUserAction(userId: string, suspend: boolean) {
  const me = await requireAdmin()
  if (userId === me.id) return { error: "You can't suspend yourself" }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  await setSetting(userId, 'SENDS_PAUSED', suspend ? 'true' : 'false')
  revalidatePath('/admin')
  return { ok: true, suspended: suspend }
}

export async function getUserSuspensions(userIds: string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const id of userIds) {
    const v = await getSetting(id, 'SENDS_PAUSED').catch(() => null)
    out[id] = v === 'true'
  }
  return out
}
