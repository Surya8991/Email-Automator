'use server'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { requireAdmin } from '@/auth'
import { db } from '@/server/db/client'
import { users, contacts, auditLog, settings } from '@/server/db/schema'
import { adminEmails } from '@/lib/env'
import { parseXlsx, parseCsv, type ImportedContact } from '@/server/services/importer'
import { dupKey } from '@/server/services/contacts'
import { emit } from '@/server/sse'
import { adminLimit } from '@/lib/admin-limit'
import { setSetting } from '@/server/services/settings'

// adminLimit lives in lib/admin-limit.ts — 'use server' files reject
// non-async exports at build time, so the helper can't live here.

// Tiny audit-log helper for admin actions. If an ea_impersonator cookie
// is set (meaning the current request is inside an impersonation session),
// the impersonator id is appended to the detail so audit forensics can
// distinguish "user did X" from "admin Y, impersonating user, did X".
// The cookie value is HMAC-signed with AUTH_SECRET — DevTools forgery
// (plant `ea_impersonator=<some-admin-id>` and have your own actions
// attributed to that admin) is rejected by verifyCookieValue. Failures
// are swallowed so a logging error can't block the action being recorded.
async function logAdmin(actorId: string, action: string, detail = '') {
  let finalDetail = detail
  try {
    const { cookies } = await import('next/headers')
    const { verifyCookieValue } = await import('@/lib/cookies')
    const jar = await cookies()
    const imp = verifyCookieValue(jar.get('ea_impersonator')?.value)
    if (imp && imp !== actorId) {
      finalDetail = detail
        ? `${detail} | impersonator=${imp}`
        : `impersonator=${imp}`
    }
  } catch { /* no cookie context — server-only callers; skip */ }
  try {
    await db.insert(auditLog).values({ userId: actorId, action, detail: finalDetail, ip: '' })
  } catch { /* non-fatal */ }
}

export async function deleteUserAction(userId: string) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'delete_user')) return { error: 'Too many admin actions — slow down' }
  if (userId === me.id) return { error: "You can't delete yourself" }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  if (adminEmails.includes((target.email ?? '').toLowerCase())) return { error: "Can't delete another admin from the UI" }
  // Cascading FKs handle contacts/templates/drafts/etc — see schema.ts.
  await db.delete(users).where(eq(users.id, userId))
  await logAdmin(me.id, 'admin.delete_user', `target=${target.email ?? userId}`)
  revalidatePath('/admin')
  return { ok: true }
}

// Soft-suspend a user. Reuses the per-user SENDS_PAUSED setting that
// scheduler-tick already honors, so a suspended user's queue stops
// without losing data. Their session keeps working — they can sign in,
// view their data, even add contacts — but the worker won't send
// anything until an admin un-suspends them.
export async function suspendUserAction(userId: string, suspend: boolean) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'suspend_user')) return { error: 'Too many admin actions — slow down' }
  if (userId === me.id) return { error: "You can't suspend yourself" }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  await setSetting(userId, 'SENDS_PAUSED', suspend ? 'true' : 'false')
  await logAdmin(me.id, suspend ? 'admin.suspend_user' : 'admin.resume_user', `target=${target.email ?? userId}`)
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
  if (!adminLimit(me.id, 'import_contacts')) return { error: 'Too many admin actions — slow down' }
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

  await logAdmin(me.id, 'admin.import_contacts', `file=${file.name} imported=${imported} dupes=${enriched.length - toInsert.length} rejected=${parsed.errors.length}`)
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

// Bulk suspend/resume — applies the per-user SENDS_PAUSED setting to many
// users at once. Skips admins and the caller themselves so the operator
// can't accidentally lock themselves out. Returns counts so the UI can
// surface "Suspended 12 of 15 (3 skipped — admin/self)".
export async function bulkSuspendUsersAction(userIds: string[], suspend: boolean) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'bulk_suspend')) return { error: 'Too many admin actions — slow down' as string }
  if (userIds.length === 0) return { error: 'No users selected' as string }
  if (userIds.length > 500) return { error: 'Too many users — max 500 per call' as string }
  const rows = await db.select().from(users).where(inArray(users.id, userIds))
  let applied = 0, skipped = 0
  for (const u of rows) {
    if (u.id === me.id || adminEmails.includes((u.email ?? '').toLowerCase())) { skipped++; continue }
    await setSetting(u.id, 'SENDS_PAUSED', suspend ? 'true' : 'false')
    applied++
  }
  await logAdmin(me.id, suspend ? 'admin.bulk_suspend' : 'admin.bulk_resume',
    `applied=${applied} skipped=${skipped}`)
  revalidatePath('/admin')
  return { ok: true as const, applied, skipped }
}

// Admin "Purge now" — bypasses the LAST_PURGE_AT day-gate and runs
// retention on every user immediately. Caller sees totals so they know
// the work happened. Audited so /audit?scope=all shows who triggered it.
export async function purgeRetentionNowAction() {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'purge_retention')) return { error: 'Too many admin actions — slow down' }
  const { purgeOldEvents, purgeOldAudit } = await import('@/server/services/retention')
  const all = await db.select({ id: users.id }).from(users)
  let events = 0, audit = 0
  const now = String(Date.now())
  for (const u of all) {
    events += await purgeOldEvents(u.id).catch(() => 0)
    audit += await purgeOldAudit(u.id).catch(() => 0)
    // Stamp LAST_PURGE_AT so the scheduler's 24h gate is reset and it
    // doesn't immediately re-purge on its next tick.
    await db.delete(settings).where(and(eq(settings.userId, u.id), eq(settings.key, 'LAST_PURGE_AT'))).catch(() => {})
    await db.insert(settings).values({ userId: u.id, key: 'LAST_PURGE_AT', value: now }).catch(() => {})
  }
  await logAdmin(me.id, 'admin.purge_retention', `events=${events} audit=${audit}`)
  revalidatePath('/admin')
  return { ok: true, events, audit, users: all.length }
}

export async function getUserSuspensions(userIds: string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  if (userIds.length === 0) return out
  // One query instead of N — read every SENDS_PAUSED row for the given
  // user set in a single scan.
  const rows = await db.select({ uid: settings.userId, value: settings.value })
    .from(settings)
    .where(and(inArray(settings.userId, userIds), eq(settings.key, 'SENDS_PAUSED')))
  for (const id of userIds) out[id] = false
  for (const r of rows) out[String(r.uid)] = r.value === 'true'
  return out
}

// ── A5: Fetch full user-detail snapshot for drill-down drawer ────────
export async function getUserDetailAction(userId: string) {
  await requireAdmin()
  const { userDetail } = await import('@/server/services/admin-analytics')
  const data = await userDetail(userId)
  if (!data) return { error: 'User not found' }
  return { ok: true as const, data }
}

// ── A6: Per-user daily send-limit override ───────────────────────────
// Stored in settings(key='DAILY_SEND_LIMIT_OVERRIDE') and honored by
// scheduler-tick. Pass 0 or '' to clear the override (falls back to env).
export async function setUserQuotaAction(userId: string, dailyLimit: number) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'set_quota')) return { error: 'Too many admin actions — slow down' }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  const value = Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 0
  if (value === 0) {
    await db.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'DAILY_SEND_LIMIT_OVERRIDE')))
    await logAdmin(me.id, 'admin.clear_quota', `target=${target.email ?? userId}`)
  } else {
    await setSetting(userId, 'DAILY_SEND_LIMIT_OVERRIDE', String(value))
    await logAdmin(me.id, 'admin.set_quota', `target=${target.email ?? userId} limit=${value}`)
  }
  revalidatePath('/admin')
  return { ok: true, value }
}

// ── A8: Impersonate user ─────────────────────────────────────────────
// Mints a fresh 1h session for the target user, REVOKES the admin's
// current session row (so the old cookie can't be replayed), and replaces
// the admin's cookie with the new one. Admin-to-admin impersonation is
// refused so the audit trail can't be laundered through another admin.
// To return to their admin account, the admin signs out and back in.
export async function impersonateUserAction(userId: string) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'impersonate')) return { error: 'Too many admin actions — slow down' }
  if (userId === me.id) return { error: 'Already signed in as yourself' }
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target) return { error: 'User not found' }
  // Refuse admin-to-admin: an admin impersonating another admin keeps
  // adminness in the new session AND launders every subsequent action
  // under the target admin's id in the audit log. Same pattern used by
  // deleteUserAction — admins can't be removed/impersonated from the UI.
  if (adminEmails.includes((target.email ?? '').toLowerCase())) {
    return { error: "Can't impersonate another admin from the UI" }
  }
  // Lazy imports — these touch headers/cookies which Next requires only at
  // request time. Avoids module-load-time side effects in tests.
  const { sessions } = await import('@/server/db/schema')
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  // SECURITY: revoke the admin's existing session row before issuing the
  // impersonation cookie, so anyone who captured the old cookie value
  // (devtools history, exported cookie jar, prior shared machine) can no
  // longer replay it. NextAuth/Drizzle stores sessions keyed by token —
  // delete by sessionToken so we don't nuke other devices the admin
  // is signed in on except this browser.
  const oldToken = jar.get('authjs.session-token')?.value
  if (oldToken) {
    await db.delete(sessions).where(eq(sessions.sessionToken, oldToken)).catch(() => {})
  }
  const { sessionCookieAttrs, signCookieValue } = await import('@/lib/cookies')
  const attrs = sessionCookieAttrs()
  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1h impersonation only
  await db.insert(sessions).values({ sessionToken: token, userId: target.id, expires })
  jar.set({ name: 'authjs.session-token', value: token, ...attrs, expires })
  // Audit-trail marker. HMAC-signed so a malicious user can't open
  // DevTools and plant `ea_impersonator=<some-admin-id>` to launder
  // their own actions onto that admin's audit trail. logAdmin's
  // verifyCookieValue rejects forged values. Cookie expires with the
  // impersonation session; cleared by exitImpersonationAction below.
  jar.set({ name: 'ea_impersonator', value: signCookieValue(me.id), ...attrs, expires })
  await logAdmin(me.id, 'admin.impersonate', `actor=${me.email ?? me.id} target=${target.email ?? target.id}`)
  return { ok: true, redirect: '/dashboard' }
}

// Companion to impersonateUserAction. Deletes the active impersonation
// session, clears both the auth cookie and the impersonator marker, and
// returns a redirect. The admin signs back in manually afterward.
export async function exitImpersonationAction() {
  const { sessions } = await import('@/server/db/schema')
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const impersonator = jar.get('ea_impersonator')?.value
  const tok = jar.get('authjs.session-token')?.value
  if (tok) await db.delete(sessions).where(eq(sessions.sessionToken, tok)).catch(() => {})
  jar.delete('authjs.session-token')
  jar.delete('ea_impersonator')
  // Best-effort audit row under the impersonator (recorded directly since
  // logAdmin needs an active session, which we just dropped).
  if (impersonator) {
    await db.insert(auditLog).values({
      userId: impersonator, action: 'admin.exit_impersonation',
      detail: '', ip: '',
    }).catch(() => {})
  }
  return { ok: true, redirect: '/login' }
}

// ── A11: Global blocklist add/remove ─────────────────────────────────
import { blocklist } from '@/server/db/schema'

export async function addGlobalBlockAction(pattern: string, type: 'email' | 'domain') {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'global_block_add')) return { error: 'Too many admin actions — slow down' }
  const clean = String(pattern ?? '').trim().toLowerCase()
  if (!clean) return { error: 'Pattern required' }
  if (type !== 'email' && type !== 'domain') return { error: 'Invalid type' }
  // Dedupe — schema doesn't have a unique constraint here (per-user
  // blocklists may legitimately collide with global entries), so check
  // before insert. Returning ok keeps idempotency for retried requests.
  const [existing] = await db.select({ id: blocklist.id }).from(blocklist)
    .where(and(sql`${blocklist.userId} IS NULL`, eq(blocklist.pattern, clean), eq(blocklist.type, type)))
  if (existing) return { ok: true as const, duplicate: true }
  await db.insert(blocklist).values({ userId: null, pattern: clean, type })
  await logAdmin(me.id, 'admin.global_block_add', `pattern=${clean} type=${type}`)
  revalidatePath('/admin/system')
  revalidatePath('/admin')
  return { ok: true }
}

export async function removeGlobalBlockAction(id: number) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'global_block_remove')) return { error: 'Too many admin actions — slow down' }
  const [target] = await db.select().from(blocklist).where(and(eq(blocklist.id, id), sql`${blocklist.userId} IS NULL`))
  if (!target) return { error: 'Global blocklist row not found' }
  await db.delete(blocklist).where(and(eq(blocklist.id, id), sql`${blocklist.userId} IS NULL`))
  await logAdmin(me.id, 'admin.global_block_remove', `pattern=${target.pattern} type=${target.type}`)
  revalidatePath('/admin/system')
  return { ok: true }
}

// ── A17: Broadcast announcement to all users ─────────────────────────
// Stored as an auditLog row with action='admin.broadcast'; layout reads
// the latest one and renders as a top banner. Empty detail clears it.
export async function broadcastAction(message: string) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'broadcast')) return { error: 'Too many admin actions — slow down' }
  const clean = String(message ?? '').trim().slice(0, 280)
  await db.insert(auditLog).values({ userId: me.id, action: 'admin.broadcast', detail: clean, ip: '' })
  revalidatePath('/admin/broadcast')
  // Bust the layout cache so currentBroadcast()'s unstable_cache result is
  // re-evaluated on the next render. (The cache also revalidates softly
  // every 300s, so worst-case staleness is 5 minutes if revalidation
  // here misses.)
  revalidatePath('/', 'layout')
  return { ok: true, message: clean }
}

// ── Admin queue bulk cancel — flip selected Scheduled/Retrying rows to
// Cancelled. Idempotent on Sent/Failed/Cancelled rows (the status filter
// in the UPDATE WHERE means they're untouched). Per-call sentinel in
// lastResult ensures the returned count matches THIS invocation only,
// not previous bulk-cancels of the same row ids.
export async function bulkCancelQueueAction(emailLogIds: number[]) {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'bulk_cancel_queue')) return { error: 'Too many admin actions — slow down' }
  if (!emailLogIds || emailLogIds.length === 0) return { error: 'No rows selected' }
  if (emailLogIds.length > 500) return { error: 'Too many rows — max 500 per call' }
  const { emailLog } = await import('@/server/db/schema')
  // Per-call sentinel: a row already cancelled by a prior bulk_cancel
  // carries `lastResult='Cancelled by admin'`; THIS call writes a
  // millisecond-tagged variant so the post-UPDATE SELECT only counts
  // rows flipped by us, not rows the operator cancelled minutes ago.
  const sentinel = `Cancelled by admin @ ${Date.now()}`
  // Only cancel rows still in a cancellable state. Sending rows are NOT
  // cancelled — they're mid-flight; let them complete or fail naturally.
  await db.update(emailLog).set({
    status: 'Cancelled',
    lastResult: sentinel,
  }).where(and(
    inArray(emailLog.id, emailLogIds),
    inArray(emailLog.status, ['Scheduled', 'Retrying']),
  ))
  // Count exactly what THIS call flipped (sentinel match).
  const flipped = await db.select({ id: emailLog.id }).from(emailLog)
    .where(and(
      inArray(emailLog.id, emailLogIds),
      eq(emailLog.status, 'Cancelled'),
      eq(emailLog.lastResult, sentinel),
    ))
  await logAdmin(me.id, 'admin.bulk_cancel_queue', `selected=${emailLogIds.length} cancelled=${flipped.length}`)
  revalidatePath('/admin/queue')
  return { ok: true, cancelled: flipped.length, requested: emailLogIds.length }
}

// ── Bonus: Recover stuck-Sending rows now (don't wait for next tick) ─
export async function recoverStuckRowsAction() {
  const me = await requireAdmin()
  if (!adminLimit(me.id, 'recover_stuck')) return { error: 'Too many admin actions — slow down' }
  const { emailLog } = await import('@/server/db/schema')
  const stuckCutoff = Date.now() - 10 * 60_000
  const stuck = await db.select({ id: emailLog.id }).from(emailLog)
    .where(and(eq(emailLog.status, 'Sending'), sql`${emailLog.scheduledAt} <= ${stuckCutoff}`))
  if (stuck.length === 0) return { ok: true, recovered: 0 }
  // Scope the UPDATE to the exact ids we saw — protects against rows that
  // legitimately finished sending between the SELECT and UPDATE. The
  // status='Sending' filter still acts as an idempotency guard.
  const ids = stuck.map((r) => r.id)
  await db.update(emailLog).set({ status: 'Scheduled', lastResult: 'Admin: recovered from stuck Sending' })
    .where(and(eq(emailLog.status, 'Sending'), inArray(emailLog.id, ids)))
  await logAdmin(me.id, 'admin.recover_stuck', `count=${stuck.length}`)
  revalidatePath('/admin/queue')
  return { ok: true, recovered: stuck.length }
}
