// Bulk-import contacts from a Universal Job Tracker .xlsx into the admin
// user's contacts table. Admin-gated: refuses to run unless ADMIN_EMAILS
// is set and the target user matches.
//
//   npm run import:admin-contacts -- "D:\Downloads\Universal_Job_Tracker_FINAL.xlsx"
//   npm run import:admin-contacts -- "D:\Downloads\Universal_Job_Tracker_FINAL.xlsx" --dry-run
//   npm run import:admin-contacts -- "D:\Downloads\Universal_Job_Tracker_FINAL.xlsx" --email admin@x.co
//
// Idempotent — re-running skips emails already present for the admin user.
import '../lib/env'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { eq, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { contacts, users } from '../server/db/schema'
import { adminEmails } from '../lib/env'
import { parseXlsx, type ImportedContact } from '../server/services/importer'

interface Args { file: string; email?: string; dryRun: boolean }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let file = '', email: string | undefined, dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--dry-run') dryRun = true
    else if (a === '--email') email = argv[++i]
    else if (!file) file = a
  }
  if (!file) {
    console.error('[import] usage: npm run import:admin-contacts -- <file.xlsx> [--email admin@x.co] [--dry-run]')
    process.exit(1)
  }
  return { file, email, dryRun }
}

// Re-parse the Contacts sheet ourselves to capture Warmth + Last Contact,
// which the generic parseXlsx drops. We still use parseXlsx for the heavy
// lifting (header detection, email validation, in-file dedupe) and just
// fold the extras into notes before insert.
function extraNotesFromSheet(file: string): Map<string, string> {
  const wb = XLSX.readFile(file)
  const sheetName = wb.SheetNames.find((n) => /contacts/i.test(n)) ?? wb.SheetNames[0]
  if (!sheetName) return new Map()
  const ws = wb.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  // Locate header row in the first 5 (same heuristic as the importer).
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const j = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase()).join(' ')
    if (j.includes('email') && j.includes('name')) { headerIdx = i; break }
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

function foldExtras(c: ImportedContact, extras: Map<string, string>): ImportedContact {
  const more = extras.get(c.recruiterEmail.toLowerCase())
  if (!more) return c
  const sep = c.notes ? ' | ' : ''
  return { ...c, notes: `${c.notes}${sep}${more}` }
}

async function main() {
  const args = parseArgs()
  if (!fs.existsSync(args.file)) {
    console.error(`[import] file not found: ${args.file}`)
    process.exit(1)
  }
  if (adminEmails.length === 0) {
    console.error('[import] ADMIN_EMAILS is empty — refusing to run. Set it in .env first.')
    process.exit(1)
  }
  const targetEmail = (args.email ?? adminEmails[0]!).toLowerCase()
  if (!adminEmails.includes(targetEmail)) {
    console.error(`[import] ${targetEmail} is not in ADMIN_EMAILS [${adminEmails.join(', ')}] — refusing.`)
    process.exit(1)
  }
  const [user] = await db.select().from(users).where(eq(users.email, targetEmail))
  if (!user) {
    console.error(`[import] user not found: ${targetEmail}. Sign in once at /login first.`)
    process.exit(1)
  }

  const buf = fs.readFileSync(args.file)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const parsed = parseXlsx(ab as ArrayBuffer)
  const extras = extraNotesFromSheet(args.file)
  const enriched = parsed.contacts.map((c) => foldExtras(c, extras))

  // Dedupe against existing rows for this admin user. SELECT all emails
  // already in the user's table and filter in JS — cheaper than a 2k-arg
  // IN clause and trivial on a single-tenant scan.
  const existing = await db
    .select({ e: contacts.recruiterEmail })
    .from(contacts)
    .where(eq(contacts.userId, user.id))
  const alreadyHave = new Set(existing.map((r) => String(r.e).toLowerCase()))
  const toInsert = enriched.filter((c) => !alreadyHave.has(c.recruiterEmail.toLowerCase()))

  console.log(`[import] file: ${args.file}`)
  console.log(`[import] admin: ${targetEmail}`)
  console.log(`[import] parsed: ${parsed.contacts.length} valid, ${parsed.errors.length} rejected`)
  console.log(`[import] skipping ${enriched.length - toInsert.length} already in DB`)
  console.log(`[import] to insert: ${toInsert.length}`)
  if (parsed.errors.length) {
    console.log('[import] sample rejections:')
    for (const e of parsed.errors.slice(0, 5)) console.log(`  line ${e.line}: ${e.reason}`)
  }

  if (args.dryRun) {
    console.log('[import] --dry-run set; no rows inserted.')
    process.exit(0)
  }

  // Bulk-insert in chunks of 500. No transaction wrapper — see db/client.ts
  // comment: better-sqlite3.transaction is sync, libSQL is async; the app
  // uses single-statement atomicity instead.
  let inserted = 0
  const CHUNK = 500
  // Pre-compute the starting `num` so the segment lands as a contiguous
  // block users can later filter on. Use max(num)+1 to avoid colliding
  // with manual entries.
  const maxRows = await db
    .select({ maxNum: sql<number>`COALESCE(MAX(${contacts.num}), 0)` })
    .from(contacts)
    .where(eq(contacts.userId, user.id))
  let nextNum = Number(maxRows[0]?.maxNum ?? 0) + 1

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK).map((c) => ({
      userId: user.id,
      num: nextNum++,
      recruiterEmail: c.recruiterEmail,
      recruiterName: c.recruiterName,
      company: c.company,
      jobTitle: c.jobTitle,
      sourceUrl: c.sourceUrl,
      platform: c.platform,
      notes: c.notes,
      tags: 'crm-import,job-tracker',
    }))
    await db.insert(contacts).values(slice)
    inserted += slice.length
    process.stdout.write(`\r[import] inserted ${inserted}/${toInsert.length}`)
  }
  process.stdout.write('\n')
  console.log(`[import] done — ${inserted} inserted, ${enriched.length - toInsert.length} dupes, ${parsed.errors.length} rejected`)
}

main().catch((e) => { console.error('[import]', e); process.exit(1) })
