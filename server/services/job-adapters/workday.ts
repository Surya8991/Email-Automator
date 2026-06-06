// Workday — public job-board POST endpoint used by their own widget.
// Site name is parsed from the URL path. Example tenant URLs:
//   https://accenture.wd103.myworkdayjobs.com/AccentureCareers
//   https://deloitte.wd5.myworkdayjobs.com/IND_Careers
//
// API: POST https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
//      body { limit, offset, searchText, appliedFacets: {} }
//
// Pagination: 3 pages × 20 = 60 max per fetch.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'

const WORKDAY_PAGES = 3
const WORKDAY_PER_PAGE = 20

function parseWorkdayUrl(url: string): { tenant: string; wd: string; site: string; origin: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const m = host.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/)
    if (!m) return null
    const tenant = m[1] ?? ''
    const wd = m[2] ?? ''
    const seg = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] ?? ''
    if (!tenant || !wd || !seg) return null
    return { tenant, wd, site: seg, origin: u.origin }
  } catch { return null }
}

// Convert "Posted 3 Days Ago" / "Posted Yesterday" / "Posted Today" → Date
function parseWorkdayPosted(s: string): Date | null {
  if (!s) return null
  const lower = s.toLowerCase()
  const now = Date.now()
  if (/today/.test(lower)) return new Date(now)
  if (/yesterday/.test(lower)) return new Date(now - 24 * 3600 * 1000)
  const m = lower.match(/(\d+)\s*\+?\s*day/)
  if (m && m[1]) return new Date(now - Number(m[1]) * 24 * 3600 * 1000)
  const mm = lower.match(/(\d+)\s*\+?\s*month/)
  if (mm && mm[1]) return new Date(now - Number(mm[1]) * 30 * 24 * 3600 * 1000)
  return null
}

export async function fetchWorkday(url: string, keywords: string): Promise<RawJob[]> {
  const parsed = parseWorkdayUrl(url)
  if (!parsed) return []
  const { tenant, wd, site, origin } = parsed
  const searchText = keywords.split(',').map((s) => s.trim()).filter(Boolean)[0] ?? ''
  const apiUrl = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`
  const results: RawJob[] = []

  for (let page = 0; page < WORKDAY_PAGES; page++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': RSS_UA,
          Referer: url,
          Origin: origin,
        },
        body: JSON.stringify({
          limit: WORKDAY_PER_PAGE,
          offset: page * WORKDAY_PER_PAGE,
          searchText,
          appliedFacets: {},
        }),
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        jobPostings?: Array<{
          title?: string; externalPath?: string; locationsText?: string
          postedOn?: string; bulletFields?: string[]
        }>
        total?: number
      }
      const jobs = data.jobPostings ?? []
      if (jobs.length === 0) break
      for (const j of jobs) {
        const link = j.externalPath ? `${origin}${j.externalPath}` : ''
        results.push({
          title: String(j.title ?? '').trim().slice(0, 200),
          company: tenant.charAt(0).toUpperCase() + tenant.slice(1),
          link: link.slice(0, 600),
          location: String(j.locationsText ?? '').trim().slice(0, 120),
          salary: '',
          description: (j.bulletFields ?? []).join(' · ').slice(0, 2000),
          postedAt: parseWorkdayPosted(String(j.postedOn ?? '')),
        })
      }
      if (jobs.length < WORKDAY_PER_PAGE) break
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

export const workdayAdapter: Adapter = {
  name: 'workday',
  matches: (url) => /\.wd\d+\.myworkdayjobs\.com/i.test(url),
  fetch: (source) => fetchWorkday(source.url, source.keywords),
}
