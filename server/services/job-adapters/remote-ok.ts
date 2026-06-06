// Remote OK — public JSON array endpoint. First element is a legal-notice
// object, skipped via the position-string filter. Salary is two ints
// (min/max) → formatted as "$Xk–$Yk".

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

export async function fetchRemoteOk(url: string): Promise<RawJob[]> {
  let apiUrl: string
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/api')) {
      apiUrl = url
    } else {
      const m = u.pathname.match(/\/remote-(.+?)-jobs/)
      const tags = m?.[1] ? m[1].replace(/-/g, '+') : ''
      apiUrl = `https://remoteok.com/api${tags ? `?tags=${encodeURIComponent(tags)}` : ''}`
    }
  } catch { return [] }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as Array<{
      position?: string; company?: string; url?: string; location?: string
      description?: string; salary_min?: number; salary_max?: number; date?: string
    }>
    return data
      .filter((j) => typeof j.position === 'string' && j.position.trim())
      .slice(0, 100)
      .map((j) => {
        let postedAt: Date | null = null
        if (j.date) { const d = new Date(j.date); if (!isNaN(d.getTime())) postedAt = d }
        const salary = j.salary_min || j.salary_max
          ? `$${Math.round((j.salary_min || j.salary_max || 0) / 1000)}k${j.salary_max && j.salary_min ? `–$${Math.round(j.salary_max / 1000)}k` : '+'}`
          : ''
        return {
          title: (j.position ?? '').trim().slice(0, 200),
          company: (j.company ?? '').trim().slice(0, 120),
          link: sanitiseLink(j.url ?? '', url),
          location: (j.location ?? '').trim().slice(0, 120),
          description: (j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
          salary,
          postedAt,
        }
      })
  } catch { return [] } finally { clearTimeout(timer) }
}

export const remoteOkAdapter: Adapter = {
  name: 'remote-ok',
  matches: (url) => /remoteok\.com/i.test(url),
  skipKeywordFilter: true,
  fetch: (source) => fetchRemoteOk(source.url),
}
