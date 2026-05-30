// CSV / Excel → contacts. Tolerant of header rows that aren't the first
// line (the v1 importer auto-detected based on "name"/"email" presence).
// XLSX uses sheetjs's CDN-hosted build (same one v1 used).
import { z } from 'zod'
import * as XLSX from 'xlsx'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ImportedContact {
  recruiterEmail: string
  recruiterName: string
  company: string
  jobTitle: string
  sourceUrl: string
  platform: string
  notes: string
}

const Headers = z.object({}).passthrough()

function findCol(headerMap: Record<string, number>, ...needles: string[]): number {
  for (const n of needles) {
    for (const k of Object.keys(headerMap)) if (k.includes(n)) return headerMap[k]!
  }
  return -1
}

function rowsToContacts(rows: unknown[][]): ImportedContact[] {
  // Find the first row in the first 5 that looks like a header.
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const j = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase()).join(' ')
    if (j.includes('name') || j.includes('email') || j.includes('company')) { headerIdx = i; break }
  }
  const headers = rows[headerIdx] ?? []
  const map: Record<string, number> = {}
  headers.forEach((h, i) => { map[String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_')] = i })
  const c = {
    name:     findCol(map, 'name'),
    company:  findCol(map, 'company'),
    role:     findCol(map, 'role', 'title', 'job'),
    email:    findCol(map, 'email'),
    linkedin: findCol(map, 'linkedin'),
    phone:    findCol(map, 'phone'),
    platform: findCol(map, 'platform'),
    notes:    findCol(map, 'notes', 'note'),
  }
  const out: ImportedContact[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue
    const email = c.email >= 0 ? String(r[c.email] ?? '').trim() : ''
    if (!email || !EMAIL.test(email)) continue
    out.push({
      recruiterEmail: email,
      recruiterName: c.name >= 0 ? String(r[c.name] ?? '').trim() : '',
      company:       c.company >= 0 ? String(r[c.company] ?? '').trim() : '',
      jobTitle:      c.role >= 0 ? String(r[c.role] ?? '').trim() : '',
      sourceUrl:     c.linkedin >= 0 ? String(r[c.linkedin] ?? '').trim() : '',
      platform:      c.platform >= 0 ? String(r[c.platform] ?? '').trim() : '',
      notes:         c.phone >= 0 && r[c.phone] ? `Phone: ${String(r[c.phone]).trim()}` :
                     c.notes >= 0 ? String(r[c.notes] ?? '').trim() : '',
    })
  }
  return out
}

// Hard cap on input row count so a malicious / accidental 1GB CSV can't OOM
// the server. 100k is well past any reasonable outreach workflow.
const MAX_ROWS = 100_000

export function parseCsv(text: string): ImportedContact[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  if (lines.length > MAX_ROWS) throw new Error(`CSV too large (${lines.length} rows, max ${MAX_ROWS})`)
  const rows = lines.map((l) => {
    // Simple CSV split: handles quoted fields with commas inside.
    const cells: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (inQ) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === ',') { cells.push(cur); cur = '' }
        else if (ch === '"' && cur === '') inQ = true
        else cur += ch
      }
    }
    cells.push(cur)
    return cells
  })
  return rowsToContacts(rows)
}

export function parseXlsx(buf: ArrayBuffer): ImportedContact[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName =
    wb.SheetNames.find((n) => /contacts/i.test(n)) ??
    wb.SheetNames.find((n) => /tracker/i.test(n)) ??
    wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
  if (rows.length > MAX_ROWS) throw new Error(`Sheet too large (${rows.length} rows, max ${MAX_ROWS})`)
  return rowsToContacts(rows)
}
