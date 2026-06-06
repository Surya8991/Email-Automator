// Foundit.in (formerly Monster India). Internal JSON API mirroring the
// Naukri pattern — slug-based URL with a hidden JSON backend.
// Pagination: 5 pages × 30 results = 150 max per fetch.

import type { Adapter, RawJob } from './types'
import { getRssUA } from './types'
import { sanitiseLink } from './utils'

function parseFounditSlug(url: string): { keyword: string; location: string } | null {
  try {
    const u = new URL(url)
    if (!/foundit\.in$/i.test(u.hostname)) return null
    const sq = u.searchParams.get('searchKey') || u.searchParams.get('query') || ''
    if (sq) return { keyword: sq, location: u.searchParams.get('location') || '' }
    const slug = u.pathname.replace(/^\/j\/|^\/|\/$/g, '')
    const m = slug.match(/^(.+?)-jobs(?:-in-(.+))?$/)
    if (!m) return null
    return { keyword: (m[1] ?? '').replace(/-/g, ' '), location: (m[2] ?? '').replace(/-/g, ' ') }
  } catch { return null }
}

export async function fetchFounditApi(url: string): Promise<RawJob[]> {
  const parsed = parseFounditSlug(url)
  if (!parsed) return []
  const { keyword, location } = parsed
  const results: RawJob[] = []
  const FOUNDIT_PAGE_SIZE = 30
  const FOUNDIT_MAX_PAGES = 5

  for (let page = 0; page < FOUNDIT_MAX_PAGES; page++) {
    const apiUrl = new URL('https://www.foundit.in/middleware/jobsearch/v1/find')
    apiUrl.searchParams.set('sort', '1')
    apiUrl.searchParams.set('rows', String(FOUNDIT_PAGE_SIZE))
    apiUrl.searchParams.set('start', String(page * FOUNDIT_PAGE_SIZE))
    apiUrl.searchParams.set('query', keyword)
    if (location) apiUrl.searchParams.set('location', location)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': getRssUA(), Accept: 'application/json',
          Referer: 'https://www.foundit.in/', Origin: 'https://www.foundit.in',
        },
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        jobSearchResponse?: {
          data?: Array<{
            title?: string; companyName?: string; jobId?: string | number
            locations?: string[]; minSal?: number; maxSal?: number
            jobDescription?: string; modifiedDate?: string
          }>
        }
      }
      const jobs = data.jobSearchResponse?.data ?? []
      if (jobs.length === 0) break
      for (const j of jobs) {
        const salary = j.minSal && j.maxSal
          ? `${j.minSal}–${j.maxSal} LPA`
          : j.minSal ? `From ${j.minSal} LPA`
          : j.maxSal ? `Up to ${j.maxSal} LPA`
          : ''
        const rawLink = j.jobId ? `https://www.foundit.in/job/details/${j.jobId}` : ''
        results.push({
          title: String(j.title ?? '').trim().slice(0, 200),
          company: String(j.companyName ?? '').trim().slice(0, 120),
          link: sanitiseLink(rawLink, url),
          location: (j.locations ?? []).join(', ').slice(0, 120),
          salary,
          description: String(j.jobDescription ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
          postedAt: j.modifiedDate ? new Date(j.modifiedDate) : null,
        })
      }
      if (jobs.length < FOUNDIT_PAGE_SIZE) break
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

export const founditAdapter: Adapter = {
  name: 'foundit',
  matches: (url) => /foundit\.in/i.test(url),
  skipKeywordFilter: true,
  fetch: (source) => fetchFounditApi(source.url),
}
