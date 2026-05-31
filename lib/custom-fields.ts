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

/** Extract the JSON block from a notes string. Returns {} if absent / malformed. */
export function readCustomFields(notes: string | null | undefined): Record<string, string> {
  if (!notes) return {}
  const m = notes.match(BLOCK_RE)
  if (!m) return {}
  try {
    const obj = JSON.parse(m[1]!)
    if (!obj || typeof obj !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof k === 'string' && k && (typeof v === 'string' || typeof v === 'number')) {
        out[k.toLowerCase()] = String(v)
      }
    }
    return out
  } catch { return {} }
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
