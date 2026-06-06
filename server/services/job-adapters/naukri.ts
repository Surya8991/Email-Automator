// Naukri.com — India's largest job board. Internal JSON API used by their
// own search UI; no auth. URL pattern: naukri.com/{role-slug}-jobs[-in-{location-slug}]
// First fetch pulls 5 pages × 100 = 500 results; ongoing pulls 1 page = 100.

import type { Adapter, RawJob, FetchOpts } from './types'
import { getRssUA } from './types'
import { sanitiseLink } from './utils'

const NAUKRI_PER_PAGE = 100
const NAUKRI_FIRST_PAGES = 5
const NAUKRI_TICK_PAGES = 1

function parseNaukriSlug(url: string): { keyword: string; location: string } | null {
  try {
    const u = new URL(url)
    if (!/naukri\.com$/i.test(u.hostname)) return null
    const slug = u.pathname.replace(/^\/|\/$/g, '')
    const m = slug.match(/^(.+?)-jobs(?:-in-(.+))?$/)
    if (!m) return null
    return {
      keyword: (m[1] ?? '').replace(/-/g, ' '),
      location: (m[2] ?? '').replace(/-/g, ' '),
    }
  } catch { return null }
}

export async function fetchNaukriApi(url: string, pages: number): Promise<RawJob[]> {
  const parsed = parseNaukriSlug(url)
  if (!parsed) return []
  const { keyword, location } = parsed
  const results: RawJob[] = []

  for (let page = 1; page <= pages; page++) {
    const apiUrl = new URL('https://www.naukri.com/jobapi/v3/search')
    apiUrl.searchParams.set('noOfResults', String(NAUKRI_PER_PAGE))
    apiUrl.searchParams.set('urlType', 'search_by_keyword')
    apiUrl.searchParams.set('searchType', 'adv')
    apiUrl.searchParams.set('keyword', keyword)
    if (location) apiUrl.searchParams.set('location', location)
    apiUrl.searchParams.set('pageNo', String(page))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          appid: '109', systemid: '109',
          'User-Agent': getRssUA(),
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.naukri.com/',
          Origin: 'https://www.naukri.com',
        },
      })
      if (!res.ok) {
        if (res.status === 406) {
          // Naukri requires recaptcha — API is temporarily blocked.
          // Return whatever we have so far; orchestrator won't fall through to AI.
          console.warn(`[naukri] recaptcha on page ${page} — returning ${results.length} leads fetched so far`)
        }
        break
      }
      const data = (await res.json()) as {
        jobDetails?: Array<{
          title?: string; companyName?: string; jdURL?: string
          placeholders?: Array<{ label?: string; title?: string }>
          jobDescription?: string; createdDate?: string | number
        }>
      }
      const jobs = data.jobDetails ?? []
      if (jobs.length === 0) break
      for (const j of jobs) {
        const ph = (label: string) => j.placeholders?.find((p) => p.label === label)?.title ?? ''
        let postedAt: Date | null = null
        if (j.createdDate) {
          const d = new Date(Number(j.createdDate))
          if (!isNaN(d.getTime())) postedAt = d
        }
        results.push({
          title: (j.title ?? '').trim().slice(0, 200),
          company: (j.companyName ?? '').trim().slice(0, 120),
          link: sanitiseLink(j.jdURL ?? '', url),
          location: ph('location').slice(0, 120),
          salary: ph('salary').slice(0, 120),
          description: (j.jobDescription ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
          postedAt,
        })
      }
      if (jobs.length < NAUKRI_PER_PAGE) break
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

export const naukriAdapter: Adapter = {
  name: 'naukri',
  matches: (url) => /naukri\.com/i.test(url),
  skipKeywordFilter: true, // search URL already encodes the keyword
  fetch: (source, opts: FetchOpts) =>
    fetchNaukriApi(source.url, opts.isFirstFetch ? NAUKRI_FIRST_PAGES : NAUKRI_TICK_PAGES),
}
