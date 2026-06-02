// User-defined custom fields, stored without a schema migration by
// piggy-backing on contacts.notes. The notes column is plain text;
// we append a small JSON block at the end with a sentinel so legacy
// (text-only) notes still render fine and the JSON survives editing.
//
//   "<freeform notes>\n\n@@CUSTOM@@{"region":"APAC","tier":"strategic"}"
//
// readCustomFields strips the block; writeCustomFields replaces it.
// {{custom_fields.region}} style placeholders are personalised at send
// time by personalizeWithCustom() below.

const SENTINEL = '@@CUSTOM@@'
// Require \n\n before the sentinel (matches what writeCustomFields emits)
// and end-of-string after the JSON. Without the \n\n guard, a user who
// types "Please mention @@CUSTOM@@" anywhere in freeform notes would have
// that text incorrectly stripped on every read/round-trip — silent data
// loss for any contact with the sentinel as literal text.
const BLOCK_RE = /\n\n@@CUSTOM@@(\{.*\})\s*$/

export interface CustomFieldDef { key: string; label?: string }

/** Strip the JSON block from a notes string, returning the user-visible portion. */
export function readNotesText(notes: string | null | undefined): string {
  if (!notes) return ''
  return notes.replace(BLOCK_RE, '').replace(/\s+$/, '')
}

// Per-render memoization. /contacts now lets users page 1000 rows at a
// time and the templates' AI preview pass calls readCustomFields per
// contact per render — JSON.parse of every notes block stacks up. A Map
// keyed by the exact notes string short-circuits the parse on subsequent
// reads in the same request without holding onto contacts after they fall
// out of scope (the map is bounded so it's safe for a long-running worker
// too). 200 entries covers a full page; older entries roll out FIFO.
const PARSE_CACHE = new Map<string, Record<string, string>>()
const PARSE_CACHE_MAX = 200

/** Extract the JSON block from a notes string. Returns {} if absent / malformed. */
export function readCustomFields(notes: string | null | undefined): Record<string, string> {
  if (!notes) return {}
  const cached = PARSE_CACHE.get(notes)
  if (cached) return cached
  const m = notes.match(BLOCK_RE)
  let out: Record<string, string> = {}
  if (m) {
    try {
      const obj = JSON.parse(m[1]!)
      if (obj && typeof obj === 'object') {
        const parsed: Record<string, string> = {}
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof k === 'string' && k && (typeof v === 'string' || typeof v === 'number')) {
            parsed[k.toLowerCase()] = String(v)
          }
        }
        out = parsed
      }
    } catch { /* malformed JSON — treat as empty */ }
  }
  // FIFO cap so a long-running worker doesn't grow this without bound.
  if (PARSE_CACHE.size >= PARSE_CACHE_MAX) {
    const first = PARSE_CACHE.keys().next().value
    if (first !== undefined) PARSE_CACHE.delete(first)
  }
  PARSE_CACHE.set(notes, out)
  return out
}

/** Compose a notes string with a fresh custom-fields block. */
export function writeCustomFields(notesText: string, fields: Record<string, string>): string {
  const head = notesText.trim()
  const filtered = Object.fromEntries(
    Object.entries(fields)
      .map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()] as const)
      .filter(([k, v]) => k && v)
  )
  if (Object.keys(filtered).length === 0) return head
  return (head ? head + '\n\n' : '') + SENTINEL + JSON.stringify(filtered)
}

/**
 * Per-user list of declared custom field keys. We don't enforce that all
 * contacts have all keys — missing values render empty. Storage: a JSON
 * array in the settings KV under CUSTOM_FIELD_KEYS.
 *
 *   ["region", "tier", "deal_stage"]
 */
export function parseCustomFieldKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9_]*$/i.test(x))
  } catch { /* ignore */ }
  return []
}
