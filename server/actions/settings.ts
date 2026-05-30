'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import {
  blocklist, campaignEnrollments, campaigns, campaignSteps, contacts,
  drafts, emailLog, events, settings, templates,
} from '@/server/db/schema'
import { setSetting } from '@/server/services/settings'

// Subset of the profile keys that live on /settings rather than /profile.
// Both pages write into the same `settings` table — they're just two
// different UIs for editing the same KV store.
const Schema = z.object({
  DAILY_SEND_LIMIT: z.string().regex(/^\d+$/).optional(),
  TIMEZONE: z.string().max(80).optional(),
  DEFAULT_ROLE_NAME: z.string().max(120).optional(),
  USER_PORTFOLIO_LINK: z.string().max(500).optional(),
  CACHED_SIGNATURE: z.string().max(8000).optional(),
  UNSUBSCRIBE_TEXT: z.string().max(500).optional(),
  UNSUBSCRIBE_ENABLED: z.string().optional(),
  // Emergency kill-switch. When 'true', the worker tick refuses to send
  // anything for this user — schedules + campaigns just sit. Flip back
  // to 'false' to resume. The toggle is per-user, not global.
  SENDS_PAUSED: z.string().optional(),
})

export async function saveSettingsAction(input: Record<string, string | undefined>) {
  const u = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) await setSetting(u.id, k, v)
  }
  revalidatePath('/settings')
  return { ok: true }
}

const DangerSchema = z.object({
  confirm: z.literal('DELETE'),
  scope: z.enum(['contacts', 'drafts', 'events', 'all']),
})

// Wipe a slice of the user's data — confirmation required.
// 'all' deletes everything BUT the user account itself; use the admin
// delete-user flow to remove the user entirely.
export async function dangerWipeAction(input: z.infer<typeof DangerSchema>) {
  const u = await requireUser()
  const parsed = DangerSchema.safeParse(input)
  if (!parsed.success) return { error: 'Confirmation text must be exactly DELETE' }

  const tables = {
    contacts: [contacts],
    drafts:   [drafts],
    events:   [events, emailLog],
    all:      [campaignEnrollments, campaignSteps, campaigns, drafts, emailLog, events, blocklist, settings, templates, contacts],
  } as const

  for (const t of tables[parsed.data.scope]) {
    // settings is keyed by userId — same column name; everything else uses
    // userId text FK to users.id. The compile-time fix below uses `as any`
    // for the dynamic table iteration since each table has its own typed col.
    await db.delete(t as never).where(eq((t as never as { userId: typeof contacts.userId }).userId, u.id))
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { ok: true }
}
