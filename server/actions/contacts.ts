'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq, inArray, and } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts, blocklist } from '@/server/db/schema'
import * as svc from '@/server/services/contacts'
import { parseCsv, parseXlsx } from '@/server/services/importer'
import { emit } from '@/server/sse'

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
  // Dedupe by (name, email) — same email with a different name is allowed.
  if (await svc.nameAndEmailExists(u.id, parsed.data.recruiterName ?? '', parsed.data.recruiterEmail)) {
    return { error: 'A contact with this name + email already exists' }
  }
  // Pick up any cf_<key> fields and bake them into notes as a JSON suffix.
  // The dialog renders one input per user-declared custom field key.
  const customFields: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('cf_') && typeof v === 'string' && v.trim()) {
      customFields[k.slice(3)] = v.trim()
    }
  }
  const notesWithCustom = Object.keys(customFields).length > 0
    ? (await import('@/lib/custom-fields')).writeCustomFields(parsed.data.notes ?? '', customFields)
    : parsed.data.notes
  await svc.addContact(u.id, { ...parsed.data, notes: notesWithCustom })
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

// Wipe everything (no filter) — caller MUST double-confirm in the UI.
export async function deleteAllContactsAction() {
  const u = await requireUser()
  const n = await svc.deleteAllContacts(u.id)
  revalidatePath('/contacts')
  revalidatePath('/admin')
  return { ok: true, deleted: n }
}

// Wipe rows matching the current filter set — caller MUST confirm with
// the count visible. Filters mirror listContacts opts.
export async function deleteFilteredContactsAction(opts: {
  search?: string; tag?: string; status?: string
  company?: string; location?: string; platform?: string
}) {
  const u = await requireUser()
  const n = await svc.deleteFilteredContacts(u.id, opts)
  revalidatePath('/contacts')
  return { ok: true, deleted: n }
}

// Remove duplicate-email rows for the current user, keeping the oldest
// (lowest-id) one per email. Idempotent — re-running returns 0 removed.
export async function dedupeContactsAction() {
  const u = await requireUser()
  const r = await svc.dedupeContacts(u.id)
  revalidatePath('/contacts')
  return { ok: true, ...r }
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
// and bulk-insert. Returns counters plus a per-row error report so the user
// can see exactly which rows were rejected and why.
export async function importContactsAction(fd: FormData) {
  const u = await requireUser()
  const file = fd.get('file')
  if (!(file instanceof File)) return { error: 'No file uploaded' }
  if (file.size > 10 * 1024 * 1024) return { error: 'File too large (10 MB max)' }

  const name = file.name.toLowerCase()
  let parsed: { contacts: Array<{ recruiterEmail: string; recruiterName: string; company: string; jobTitle: string; sourceUrl: string; platform: string; notes: string }>; errors: Array<{ line: number; reason: string; sample?: string }> }
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
  if (parsed.contacts.length === 0 && parsed.errors.length === 0) {
    return { error: 'No valid rows found (need an email column with at least one row)' }
  }

  // Errors that survived parsing also survive the insert phase — only
  // append "already exists" failures here. Duplicate detection keys on
  // (name + email) so the same email can appear under different names.
  const errors = [...parsed.errors]
  // Snapshot existing (name, email) tuples once so we don't fire 2k
  // queries inside the loop.
  const existing = await db.select({ name: contacts.recruiterName, email: contacts.recruiterEmail })
    .from(contacts).where(eq(contacts.userId, u.id))
  const have = new Set(existing.map((r) => svc.dupKey(String(r.name ?? ''), String(r.email ?? ''))))
  // Tell the UI how much work is ahead. Emit progress every ~50 rows so a
  // 2k-row CSV gets ~40 updates and the bar moves smoothly.
  emit(u.id, { type: 'contact_import_start', total: parsed.contacts.length })
  const TICK = 50
  let imported = 0, duplicates = 0
  for (const c of parsed.contacts) {
    const key = svc.dupKey(c.recruiterName, c.recruiterEmail)
    if (have.has(key)) {
      duplicates++
      if (errors.length < 200) errors.push({ line: 0, reason: `Already in your contacts: ${c.recruiterName || '(no name)'} <${c.recruiterEmail}>` })
      continue
    }
    have.add(key)
    await svc.addContact(u.id, c)
    imported++
    if ((imported + duplicates) % TICK === 0) {
      emit(u.id, {
        type: 'contact_import_progress',
        processed: imported + duplicates, total: parsed.contacts.length,
      })
    }
  }
  emit(u.id, {
    type: 'contact_import_done',
    processed: imported, total: parsed.contacts.length,
    duplicates, rejected: parsed.errors.length,
  })
  revalidatePath('/contacts')
  revalidatePath('/dashboard')
  return {
    ok: true,
    imported,
    duplicates,
    rejected: parsed.errors.length,
    total: parsed.contacts.length + parsed.errors.length,
    errors: errors.slice(0, 200), // cap response payload
  }
}
