// Recruitee — public JSON offers API. Used by many EU/IN SaaS shops.
// Endpoint: https://{tenant}.recruitee.com/api/offers/

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

function parseRecruiteeUrl(url: string): { tenant: string } | null {
  try {
    const u = new URL(url)
    const m = u.hostname.toLowerCase().match(/^([^.]+)\.recruitee\.com$/)
    if (!m) return null
    return { tenant: m[1] ?? '' }
  } catch { return null }
}

export async function fetchRecruitee(url: string): Promise<RawJob[]> {
  const parsed = parseRecruiteeUrl(url)
  if (!parsed?.tenant) return []
  const apiUrl = `https://${parsed.tenant}.recruitee.com/api/offers/`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      offers?: Array<{
        title?: string; description?: string; careers_url?: string
        city?: string; country?: string; department?: string
        created_at?: string; salary?: { min?: number; max?: number; currency?: string }
      }>
    }
    return (data.offers ?? []).slice(0, 100).map((j) => {
      const sal = j.salary
      const salary = sal && (sal.min || sal.max)
        ? `${sal.currency ?? ''} ${sal.min ?? ''}${sal.min && sal.max ? `–${sal.max}` : sal.max ? `up to ${sal.max}` : '+'}`.trim()
        : ''
      return {
        title: String(j.title ?? '').trim().slice(0, 200),
        company: parsed.tenant.charAt(0).toUpperCase() + parsed.tenant.slice(1),
        link: sanitiseLink(String(j.careers_url ?? ''), url),
        location: [j.city, j.country].filter(Boolean).join(', ').slice(0, 120),
        salary: salary.slice(0, 120),
        description: String(j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
        postedAt: j.created_at ? new Date(j.created_at) : null,
      }
    })
  } catch { return [] } finally { clearTimeout(timer) }
}

export const recruiteeAdapter: Adapter = {
  name: 'recruitee',
  matches: (url) => /\.recruitee\.com/i.test(url),
  fetch: (source) => fetchRecruitee(source.url),
}
