// Shared helpers used by multiple adapters.

/**
 * Tracking-param key regex. Stripped from every sanitised URL so two
 * leads pointing at the same JD through different referral channels
 * dedup cleanly. Keep narrow — we don't want to strip params the JD
 * actually depends on (e.g. ?gh_jid=12345 IS the job id on Greenhouse).
 */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_eid$|mc_cid$|src$|ref$|source$|lever-source$|gh_src$|origin$|trk$)/i

/**
 * Validates and resolves a job URL. Returns '' if:
 * - the URL is empty,
 * - the URL is the same as the source board/search page (AI hallucinated
 *   the source URL as a per-job link), or
 * - the URL is relative and can't be resolved against sourceUrl, or
 * - the URL is not http(s) — javascript:, data:, mailto: etc.
 *
 * Tracking parameters (utm_*, gclid, fbclid, src, ref, lever-source,
 * gh_src, origin) are stripped so two referrals to the same JD produce
 * one row, not two. Job-id params (gh_jid, lever job id in path) are
 * preserved.
 *
 * Result is capped at 600 chars to keep the column bounded.
 */
export function sanitiseLink(raw: string, sourceUrl: string): string {
  if (!raw) return ''
  let href = raw.trim()
  if (!href.startsWith('http')) {
    try { href = new URL(href, sourceUrl).href } catch { return '' }
  }
  if (!/^https?:\/\//i.test(href)) return ''
  try {
    const a = new URL(href), b = new URL(sourceUrl)
    // Same-as-source = adapter handed us back the search page; reject.
    if (a.origin === b.origin && a.pathname === b.pathname) return ''
    // Strip known tracking params in place. Iterating over a snapshot
    // because mutation during iteration is undefined in the URLSearchParams
    // spec.
    for (const k of Array.from(a.searchParams.keys())) {
      if (TRACKING_PARAMS.test(k)) a.searchParams.delete(k)
    }
    // Drop the trailing '?' if we removed every param.
    href = a.toString()
  } catch { return '' }
  return href.slice(0, 600)
}
