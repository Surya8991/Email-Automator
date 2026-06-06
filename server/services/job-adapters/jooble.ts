// Jooble meta-aggregator. POST API with JSON body, single key in URL path.
// Free key at jooble.org/api/about (~500 req/day on the free tier).
//
// User-facing URL pattern: https://jooble.org/jobs?keywords=SEO&location=Mumbai
// We parse keywords/location and call POST /api/{key}.
//
// Pagination: 3 pages × 20 results.

import type { Adapter, RawJob } from './types'
import { env } from '@/lib/env'
import { sanitiseLink } from './utils'

const JOOBLE_PAGES = 3
const JOOBLE_PER_PAGE = 20

function parseJoobleUrl(url: string): { keywords: string; location: string } | null {
  try {
    const u = new URL(url)
    if (!/jooble\./i.test(u.hostname)) return null
    return {
      keywords: u.searchParams.get('keywords') || u.searchParams.get('q') || '',
      location: u.searchParams.get('location') || '',
    }
  } catch { return null }
}

export async function fetchJooble(url: string): Promise<RawJob[]> {
  if (!env.JOOBLE_API_KEY) {
    console.warn('[jooble] JOOBLE_API_KEY not set — skipping')
    return []
  }
  const parsed = parseJoobleUrl(url)
  if (!parsed) return []
  const results: RawJob[] = []

  for (let page = 1; page <= JOOBLE_PAGES; page++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(`https://jooble.org/api/${encodeURIComponent(env.JOOBLE_API_KEY)}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          keywords: parsed.keywords,
          location: parsed.location,
          page,
          ResultOnPage: JOOBLE_PER_PAGE,
        }),
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        jobs?: Array<{
          title?: string; location?: string; snippet?: string
          salary?: string; source?: string; type?: string; link?: string
          company?: string; updated?: string
        }>
      }
      const jobs = data.jobs ?? []
      if (jobs.length === 0) break
      for (const j of jobs) {
        results.push({
          title: String(j.title ?? '').trim().slice(0, 200),
          company: String(j.company ?? j.source ?? '').trim().slice(0, 120),
          link: sanitiseLink(String(j.link ?? ''), url),
          location: String(j.location ?? '').trim().slice(0, 120),
          salary: String(j.salary ?? '').trim().slice(0, 120),
          description: String(j.snippet ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
          postedAt: j.updated ? new Date(j.updated) : null,
        })
      }
      if (jobs.length < JOOBLE_PER_PAGE) break
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

export const joobleAdapter: Adapter = {
  name: 'jooble',
  matches: (url) => /jooble\./i.test(url),
  skipKeywordFilter: true,
  fetch: (source) => fetchJooble(source.url),
}
