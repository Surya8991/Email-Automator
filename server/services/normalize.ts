// Salary, location, and title normalizers + cross-board dedup key.
// Pure functions — easy to unit-test in isolation.
//
// Used by tickSource (after the adapter returns raw jobs) to populate the
// canonical salary_min/max/ccy/period, location_norm, remote_scope, and
// cross_key columns on jobLeads.

import crypto from 'node:crypto'

// ── Salary ───────────────────────────────────────────────────────────

export type NormalizedSalary = {
  min: number | null
  max: number | null
  ccy: string             // 'INR' | 'USD' | 'EUR' | 'GBP' | ''
  period: 'year' | 'month' | ''
}

function detectCurrency(raw: string, hint?: string): string {
  if (hint) return hint
  if (/₹|INR|RS\.?|rupees?|LPA|lacs?|lakh|crore/i.test(raw)) return 'INR'
  if (/€|EUR/.test(raw)) return 'EUR'
  if (/£|GBP|pounds?/i.test(raw)) return 'GBP'
  if (/\$|USD/.test(raw)) return 'USD'
  return ''
}

/**
 * Parse a raw salary string into canonical {min, max, ccy, period}.
 * Handles:
 *   "6-9 LPA"           → {600000, 900000, INR, year}
 *   "From 8 LPA"        → {800000, null, INR, year}
 *   "₹50k-80k/month"    → {50000, 80000, INR, month}
 *   "$80k-$120k"        → {80000, 120000, USD, year}
 *   "Up to 12 LPA"      → {null, 1200000, INR, year}
 *   "8 lakhs"           → {800000, null, INR, year}
 */
export function normalizeSalary(raw: string, hintCcy?: string): NormalizedSalary {
  if (!raw || !raw.trim()) return { min: null, max: null, ccy: '', period: '' }
  const s = raw.trim()
  const ccy = detectCurrency(s, hintCcy)
  const isLpa   = /LPA|lacs?|lakh/i.test(s)
  const isCrore = /crore|cr\b/i.test(s)
  const period: 'year' | 'month' | '' =
    /\/\s*month|per\s*month|monthly|p\.?m\b/i.test(s) ? 'month' :
    /\/\s*(yr|year)|per\s*annum|annually|p\.?a\b|LPA|lacs?|lakh|crore/i.test(s) ? 'year' :
    ''

  // Pull every "number + optional k/L/cr" token.
  const re = /(\d+(?:\.\d+)?)\s*(k|K|l|L|cr)?/g
  const nums: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null && nums.length < 4) {
    let n = Number(m[1])
    const unit = (m[2] ?? '').toLowerCase()
    if (unit === 'k') n *= 1_000
    else if (unit === 'l') n *= 100_000
    else if (unit === 'cr') n *= 10_000_000
    else if (isCrore && !unit) n *= 10_000_000
    else if (isLpa && !unit) n *= 100_000
    nums.push(Math.round(n))
  }
  if (nums.length === 0) return { min: null, max: null, ccy, period }

  // "Up to X" / "Max X" → only a max.
  if (/up\s*to|max(imum)?\b|≤|<=/i.test(s) && nums.length === 1) {
    return { min: null, max: nums[0] ?? null, ccy, period }
  }
  // "From X" / "starts" / "min" → only a min.
  if (/from\b|starts?|min(imum)?\b|≥|>=|\bplus\b|\+/i.test(s) && nums.length === 1) {
    return { min: nums[0] ?? null, max: null, ccy, period }
  }
  // Range "X-Y" / "X to Y" → both.
  if (nums.length >= 2) {
    const [a, b] = [nums[0] ?? 0, nums[1] ?? 0]
    return { min: Math.min(a, b), max: Math.max(a, b), ccy, period }
  }
  // Single number — treat as min (e.g. "8 LPA").
  return { min: nums[0] ?? null, max: null, ccy, period }
}

// ── Location ────────────────────────────────────────────────────────

export type NormalizedLocation = {
  /** Canonical city slug: 'bangalore' | 'mumbai' | '' for remote/unknown. */
  norm: string
  remoteScope: 'office' | 'hybrid' | 'remote-in' | 'remote-global' | ''
}

const LOCATION_ALIASES: Record<string, string> = {
  bangalore: 'bangalore', bengaluru: 'bangalore', blr: 'bangalore',
  mumbai: 'mumbai', bombay: 'mumbai',
  gurgaon: 'gurgaon', gurugram: 'gurgaon',
  delhi: 'delhi', ncr: 'delhi', 'new delhi': 'delhi', 'delhi ncr': 'delhi',
  hyderabad: 'hyderabad', hyd: 'hyderabad', secunderabad: 'hyderabad',
  chennai: 'chennai', madras: 'chennai',
  pune: 'pune', poona: 'pune',
  kolkata: 'kolkata', calcutta: 'kolkata',
  ahmedabad: 'ahmedabad',
  noida: 'noida', greater_noida: 'noida',
}

/**
 * Normalize a location string to a canonical city + remote-scope flag.
 * Returns norm='' for pure-remote or unknown locations.
 */
export function normalizeLocation(raw: string): NormalizedLocation {
  if (!raw || !raw.trim()) return { norm: '', remoteScope: '' }
  const s = raw.trim().toLowerCase()

  // Remote detection runs first — "Remote (India)" is remote-in, not Mumbai.
  if (/remote.*?(india|in\b|🇮🇳)/i.test(s) || /\bindia.*remote/i.test(s)) {
    return { norm: '', remoteScope: 'remote-in' }
  }
  if (/^\s*remote\s*$|wfh|work.from.home|fully.remote|anywhere/i.test(s)) {
    return { norm: '', remoteScope: 'remote-global' }
  }
  const hybrid = /hybrid/i.test(s)

  // Try alias map — strip parenthetical + trailing country bits first.
  const cleaned = s.replace(/\([^)]*\)/g, '').replace(/,?\s*(india|in)\b/g, '').trim()
  for (const [alias, canonical] of Object.entries(LOCATION_ALIASES)) {
    if (cleaned === alias || cleaned.startsWith(alias) || cleaned.includes(` ${alias}`) || cleaned.includes(`${alias},`)) {
      return { norm: canonical, remoteScope: hybrid ? 'hybrid' : 'office' }
    }
  }
  // Unknown city — keep first segment as a best-effort norm
  const first = cleaned.split(/[,/·]/)[0]?.trim() ?? ''
  return { norm: first.slice(0, 40), remoteScope: hybrid ? 'hybrid' : (first ? 'office' : '') }
}

// ── Title ────────────────────────────────────────────────────────────

/**
 * Strip seniority + parenthetical / suffix noise from a title so two
 * postings of "Sr. Performance Marketing Manager (Remote)" and
 * "Performance Marketing Manager" hash to the same crossKey.
 */
export function normalizeTitle(raw: string): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')              // (Remote), (Hybrid), …
    .replace(/\bsr\.?\b|\bsenior\b/g, ' ')
    .replace(/\bjr\.?\b|\bjunior\b/g, ' ')
    .replace(/\blead\b|\bprincipal\b|\bstaff\b/g, ' ')
    .replace(/\b(i{1,3}|iv|v)\b/g, ' ')      // Engineer I / II / III
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCompany(raw: string): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|gmbh|ag)\b\.?/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** SHA-1 of (companyNorm|titleNorm|locationNorm). Stable, 40 chars. */
export function crossKey(company: string, title: string, locationNorm: string): string {
  const c = normalizeCompany(company)
  const t = normalizeTitle(title)
  if (!c || !t) return ''
  const payload = `${c}|${t}|${locationNorm}`
  return crypto.createHash('sha1').update(payload).digest('hex')
}

// ── Aggregator detection (for canonical-wins-over-aggregator dedup) ──

/** Adapter names whose data is lower-quality than a direct ATS feed.
 *  When a canonical (ATS / company page) lead arrives with the same
 *  crossKey, the canonical one wins. */
export const AGGREGATOR_ADAPTERS = new Set([
  'rss',         // Indeed RSS, TimesJobs RSS
  'remote-ok',
  'remotive',
  'adzuna',
  'jooble',
])

export function isAggregator(adapterName: string): boolean {
  return AGGREGATOR_ADAPTERS.has(adapterName)
}
