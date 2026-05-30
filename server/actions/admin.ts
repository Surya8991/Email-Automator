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
