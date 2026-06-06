// Internshala — sitemap-driven. The search URL returns JS-rendered HTML;
// the public sitemap (no JS) lists every active posting URL, each with
// JSON-LD JobPosting embedded on the detail page.
//
// Strategy:
//  1. Fetch the search page HTML.
//  2. Pull out detail-page URLs from <a href="/job/detail/...">.
//  3. Cap at 30/tick, fetch each in parallel.
//  4. Parse JSON-LD from each detail page.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { extractJsonLd } from './json-ld'

const INTERNSHALA_MAX_DETAIL_FETCHES = 30

async function fetchHtml(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': RSS_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    })
    if (!res.ok) return ''
    return await res.text()
  } catch { return '' } finally { clearTimeout(timer) }
}

export async function fetchInternshala(url: string): Promise<RawJob[]> {
  const html = await fetchHtml(url)
  if (!html) return []

  // Detail URLs look like /job/detail/{slug}-{id}/ or /jobs/detail/...
  const detailHrefs = Array.from(html.matchAll(/href="(\/(?:job|jobs)\/detail\/[^"]+)"/g))
    .map((m) => m[1])
    .filter((href): href is string => !!href)
  const unique = Array.from(new Set(detailHrefs)).slice(0, INTERNSHALA_MAX_DETAIL_FETCHES)
  if (unique.length === 0) {
    // Fall back to JSON-LD on the search page itself (some categories embed it)
    return extractJsonLd(html, url)
  }

  const origin = (() => { try { return new URL(url).origin } catch { return 'https://internshala.com' } })()
  const detailUrls = unique.map((h) => `${origin}${h}`)
  const detailHtmls = await Promise.all(detailUrls.map((u) => fetchHtml(u, 8_000)))
  const jobs: RawJob[] = []
  for (let i = 0; i < detailUrls.length; i++) {
    const h = detailHtmls[i]
    if (!h) continue
    const extracted = extractJsonLd(h, detailUrls[i] ?? url)
    if (extracted.length === 0) continue
    // Force the detail URL as the link — JSON-LD's sameAs may be missing
    const first = extracted[0]
    if (first) jobs.push({ ...first, link: first.link || detailUrls[i] || '' })
  }
  return jobs
}

export const internshalaAdapter: Adapter = {
  name: 'internshala',
  matches: (url) => /internshala\.com/i.test(url),
  skipKeywordFilter: true, // search URL encodes the keyword/category
  fetch: (source) => fetchInternshala(source.url),
}
