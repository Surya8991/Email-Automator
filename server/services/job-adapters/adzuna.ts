// Adzuna meta-aggregator. Covers India natively across many underlying
// boards via a single REST call. Free dev key at developer.adzuna.com
// (250 req/day, 25 req/min).
//
// User-facing URL pattern: https://adzuna.com/jobs?what=SEO&where=Bangalore&country=in
// We parse what/where/country and call the real API.
//
// Pagination: 3 pages × 50 results = 150 max per fetch.

import type { Adapter, RawJob } from './types'
import { env } from '@/lib/env'
import { sanitiseLink } from './utils'

const ADZUNA_PAGES = 3
const ADZUNA_PER_PAGE = 50

function parseAdzunaUrl(url: string): { what: string; where: string; country: string } | null {
  try {
    const u = new URL(url)
    if (!/adzuna\./i.test(u.hostname)) return null
    return {
      what: u.searchParams.get('what') || u.searchParams.get('q') || '',
      where: u.searchParams.get('where') || u.searchParams.get('location') || '',
      country: (u.searchParams.get('country') || 'in').toLowerCase().slice(0, 2),
    }
  } catch { return null }
}

export async function fetchAdzuna(url: string): Promise<RawJob[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
    console.warn('[adzuna] ADZUNA_APP_ID/KEY not set — skipping')
    return []
  }
  const parsed = parseAdzunaUrl(url)
  if (!parsed) return []
  const { what, where, country } = parsed
  const results: RawJob[] = []

  for (let page = 1; page <= ADZUNA_PAGES; page++) {
    const apiUrl = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`)
    apiUrl.searchParams.set('app_id', env.ADZUNA_APP_ID)
    apiUrl.searchParams.set('app_key', env.ADZUNA_APP_KEY)
    apiUrl.searchParams.set('results_per_page', String(ADZUNA_PER_PAGE))
    if (what) apiUrl.searchParams.set('what', what)
    if (where) apiUrl.searchParams.set('where', where)
    apiUrl.searchParams.set('content-type', 'application/json')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(apiUrl.toString(), {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        results?: Array<{
          title?: string; redirect_url?: string; description?: string
          company?: { display_name?: string }
          location?: { display_name?: string }
          salary_min?: number; salary_max?: number; salary_is_predicted?: string
          created?: string
        }>
      }
      const jobs = data.results ?? []
      if (jobs.length === 0) break
      const currencySymbol = country === 'in' ? '₹' : country === 'gb' ? '£' : '$'
      for (const j of jobs) {
        const salary = j.salary_min || j.salary_max
          ? `${currencySymbol}${Math.round((j.salary_min || j.salary_max || 0) / 1000)}k${j.salary_min && j.salary_max ? `–${currencySymbol}${Math.round(j.salary_max / 1000)}k` : '+'}`
          : ''
        results.push({
          title: String(j.title ?? '').trim().slice(0, 200),
          company: String(j.company?.display_name ?? '').trim().slice(0, 120),
          link: sanitiseLink(String(j.redirect_url ?? ''), url),
          location: String(j.location?.display_name ?? '').trim().slice(0, 120),
          salary,
          description: String(j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
          postedAt: j.created ? new Date(j.created) : null,
        })
      }
      if (jobs.length < ADZUNA_PER_PAGE) break
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

export const adzunaAdapter: Adapter = {
  name: 'adzuna',
  matches: (url) => /adzuna\./i.test(url),
  skipKeywordFilter: true, // ?what= already filters by keyword
  fetch: (source) => fetchAdzuna(source.url),
}
