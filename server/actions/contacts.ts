'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq, inArray, and } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts, blocklist } from '@/server/db/schema'
import * as svc from '@/server/services/contacts'
import { parseCsv, parseXlsx } from '@/server/services/importer'

const NewContactSchema = z.object({
  recruiterEmail: z.string().email(),
  recruiterName: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  jobTitle: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  platform: z.string().max(60).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  tags: z.string().max(200).optional(),
})

export async function addContactAction(formData: FormData) {
  const u = await requireUser()
  const parsed = NewContactSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (await svc.emailExists(u.id, parsed.data.recruiterEmail)) return { error: 'This email already exists' }
  await svc.addContact(u.id, parsed.data)
  revalidatePath('/contacts')
  return { ok: true }
}

export async function deleteContactAction(id: number) {
  const u = await requireUser()
  await svc.deleteContact(u.id, id)
  revalidatePath('/contacts')
  return { ok: true }
}

export async function deleteContactsBulkAction(ids: number[]) {
  const u = await requireUser()
  await svc.deleteContactsBulk(u.id, ids)
  revalidatePath('/contacts')
  return { ok: true, deleted: ids.length }
}

// Bulk-tag the selected contacts. `add` and `remove` are comma-separated.
export async function bulkTagAction(ids: number[], add: string, remove: string) {
  const u = await requireUser()
  if (ids.length === 0) return { error: 'No contacts selected' }
  const addList = add.split(',').map((s) => s.trim()).filter(Boolean)
  const remList = remove.split(',').map((s) => s.trim()).filter(Boolean)
  const r = await svc.bulkTag(u.id, ids, addList, remList)
  revalidatePath('/contacts')
  return { ok: true, ...r }
}

// Add every selected contact's email to the per-user blocklist, then
// delete them from contacts. One-step "this person should never hear
// from me again" flow.
export async function bulkBlockAction(ids: number[]) {
  const u = await requireUser()
  if (ids.length === 0) return { error: 'No contacts selected' }
  const rows = await db.select({ email: contacts.recruiterEmail }).from(contacts)
    .where(and(eq(contacts.userId, u.id), inArray(contacts.id, ids)))
  let blocked = 0
  for (const r of rows) {
    if (!r.email) continue
    try {
      await db.insert(blocklist).values({ userId: u.id, pattern: r.email.toLowerCase(), type: 'email' })
      blocked++
    } catch { /* unique-conflict ok — already blocked */ }
  }
  await svc.deleteContactsBulk(u.id, ids)
  revalidatePath('/contacts')
  revalidatePath('/blocklist')
  return { ok: true, blocked, deleted: rows.length }
}

// Reset the email_status on a set of contacts (so the next "Create drafts"
// re-considers them). With no ids, clears the status on every contact whose
// last action was a draft/sent/error/cancelled — mirrors v1 behavior.
export async function resetStatusAction(ids: number[] = []) {
  const u = await requireUser()
  if (ids.length === 0) {
    await db.update(contacts).set({ emailStatus: '' }).where(eq(contacts.userId, u.id))
  } else {
    await db.update(contacts).set({ emailStatus: '' })
      .where(and(eq(contacts.userId, u.id), inArray(contacts.id, ids)))
  }
  revalidatePath('/contacts')
  revalidatePath('/dashboard')
  return { ok: true }
}

// CSV/Excel import. Browser uploads a File via FormData; we parse server-side
// and bulk-insert, skipping duplicates and blocklisted addresses.
export async function importContactsAction(fd: FormData) {
  const u = await requireUser()
  const file = fd.get('file')
  if (!(file instanceof File)) return { error: 'No file uploaded' }
  if (file.size > 10 * 1024 * 1024) return { error: 'File too large (10 MB max)' }

  const name = file.name.toLowerCase()
  let parsed: Array<{ recruiterEmail: string; recruiterName: string; company: string; jobTitle: string; sourceUrl: string; platform: string; notes: string }>
  try {
    if (name.endsWith('.csv')) {
      parsed = parseCsv(await file.text())
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      parsed = parseXlsx(await file.arrayBuffer())
    } else {
      return { error: 'Use .csv, .xlsx, or .xls' }
    }
  } catch (e) {
    return { error: 'Parse failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (parsed.length === 0) return { error: 'No valid rows found (need an email column)' }

  let imported = 0, duplicates = 0
  for (const c of parsed) {
    if (await svc.emailExists(u.id, c.recruiterEmail)) { duplicates++; continue }
    await svc.addContact(u.id, c)
    imported++
  }
  revalidatePath('/contacts')
  revalidatePath('/dashboard')
  return { ok: true, imported, duplicates, total: parsed.length }
}
