'use server'
import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users, contacts } from '@/server/db/schema'
import { adminEmails } from '@/lib/env'
import { parseXlsx, parseCsv, type ImportedContact } from '@/server/services/importer'
import { dupKey } from '@/server/services/contacts'
import { emit } from '@/server/sse'

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

// One-shot upload: drop an .xlsx (or .csv) onto /admin and bulk-import
// contacts into the admin's own table. Mirrors the CLI behavior of
// scripts/import-admin-contacts.ts — folds Warmth + Last Contact + Phone
// into notes, tags rows "crm-import,job-tracker", dedupes against the
// admin's existing emails. Idempotent — re-upload skips dupes.
export async function adminImportContactsAction(fd: FormData) {
  const me = await requireAdmin()
  const file = fd.get('file')
  if (!(file instanceof File)) return { error: 'No file uploaded' }
  // 25 MB cap — the workbook is ~600 KB so we have plenty of headroom for
  // larger CRM exports, but not so much that an accidental upload OOMs
  // the serverless function.
  if (file.size > 25 * 1024 * 1024) return { error: 'File too large (25 MB max)' }

  const name = file.name.toLowerCase()
  const buf = name.endsWith('.csv') ? null : await file.arrayBuffer()
  let parsed: { contacts: ImportedContact[]; errors: Array<{ line: number; reason: string; sample?: string }> }
  try {
    if (name.endsWith('.csv')) parsed = parseCsv(await file.text())
    else if (name.endsWith('.xlsx') || name.endsWith('.xls')) parsed = parseXlsx(buf!)
    else return { error: 'Use .csv, .xlsx, or .xls' }
  } catch (e) {
    return { error: 'Parse failed: ' + (e instanceof Error ? e.message : String(e)) }
  }

  // For xlsx — re-walk the Contacts sheet to fold Warmth + Last Contact
  // into notes (the generic parser drops these). For csv, skip — those
  // columns may or may not be present and folding is harmless if missing.
  const extras = buf ? warmthAndLastContact(buf) : new Map<string, string>()
  const enriched = parsed.contacts.map((c) => {
    const more = extras.get(c.recruiterEmail.toLowerCase())
    if (!more) return c
    const sep = c.notes ? ' | ' : ''
    return { ...c, notes: `${c.notes}${sep}${more}` }
  })

  // Dedupe against admin's existing rows. Key is (name, email) — same
  // email under a different name is allowed. Pull all rows once; single
  // tenant scan beats a 2k-arg IN clause and lets us also catch
  // duplicates *within* the upload file in one pass.
  const existing = await db.select({ n: contacts.recruiterName, e: contacts.recruiterEmail })
    .from(contacts).where(eq(contacts.userId, me.id))
  const have = new Set(existing.map((r) => dupKey(String(r.n ?? ''), String(r.e ?? ''))))
  const toInsert: ImportedContact[] = []
  for (const c of enriched) {
    const key = dupKey(c.recruiterName, c.recruiterEmail)
    if (have.has(key)) continue
    have.add(key) // catches within-file dupes too
    toInsert.push(c)
  }

  // Pre-compute starting num so the import lands as a contiguous block.
  const maxRow = await db.select({ maxNum: sql<number>`COALESCE(MAX(${contacts.num}), 0)` })
    .from(contacts).where(eq(contacts.userId, me.id))
  let nextNum = Number(maxRow[0]?.maxNum ?? 0) + 1

  // Chunked inserts. No transaction wrapper — see server/db/client.ts;
  // the dual-driver setup means transaction APIs differ across drivers.
  // SSE events go to the admin's open tabs so the upload card can render
  // a live progress bar.
  emit(me.id, { type: 'contact_import_start', total: toInsert.length })
  const CHUNK = 500
  let imported = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK).map((c) => ({
      userId: me.id, num: nextNum++,
      recruiterEmail: c.recruiterEmail, recruiterName: c.recruiterName,
      company: c.company, jobTitle: c.jobTitle, sourceUrl: c.sourceUrl,
      platform: c.platform, notes: c.notes, tags: 'crm-import,job-tracker',
    }))
    await db.insert(contacts).values(slice)
    imported += slice.length
    emit(me.id, { type: 'contact_import_progress', processed: imported, total: toInsert.length })
  }
  emit(me.id, {
    type: 'contact_import_done',
    processed: imported, total: toInsert.length,
    duplicates: enriched.length - toInsert.length,
    rejected: parsed.errors.length,
  })

  revalidatePath('/admin')
  revalidatePath('/contacts')
  return {
    ok: true,
    imported,
    duplicates: enriched.length - toInsert.length,
    rejected: parsed.errors.length,
    total: parsed.contacts.length + parsed.errors.length,
    errors: parsed.errors.slice(0, 50),
  }
}

// Extract Warmth + Last Contact per email from the workbook's Contacts
// sheet. The generic parser drops these because they don't map to
// schema columns; admin imports preserve them by folding into `notes`.
function warmthAndLastContact(buf: ArrayBuffer): Map<string, string> {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames.find((n) => /contacts/i.test(n)) ?? wb.SheetNames[0]
  if (!sheetName) return new Map()
  const ws = wb.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  // Match the importer's header-detection heuristic (first 5 rows).
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase()).join(' ')
    if (joined.includes('email') && joined.includes('name')) { headerIdx = i; break }
  }
  const headers = (rows[headerIdx] ?? []).map((h) => String(h ?? '').toLowerCase())
  const emailIdx = headers.findIndex((h) => h.includes('email'))
  const warmthIdx = headers.findIndex((h) => h.includes('warmth'))
  const lastIdx = headers.findIndex((h) => h.includes('last contact'))
  const out = new Map<string, string>()
  if (emailIdx < 0) return out
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const email = String(r[emailIdx] ?? '').trim().toLowerCase()
    if (!email) continue
    const extras: string[] = []
    if (warmthIdx >= 0 && r[warmthIdx]) extras.push(`Warmth: ${String(r[warmthIdx]).trim()}`)
    if (lastIdx >= 0 && r[lastIdx]) extras.push(`Last Contact: ${String(r[lastIdx]).trim()}`)
    if (extras.length) out.set(email, extras.join(' | '))
  }
  return out
}

export async function getUserSuspensions(userIds: string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const id of userIds) {
    const v = await getSetting(id, 'SENDS_PAUSED').catch(() => null)
    out[id] = v === 'true'
  }
  return out
}
