// Remotive — public JSON API for remote jobs. No auth, ~500 jobs max.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

export async function fetchRemotive(url: string): Promise<RawJob[]> {
  let search = ''
  let category = ''
  try {
    const u = new URL(url)
    search = u.searchParams.get('search') || u.searchParams.get('query') || u.searchParams.get('q') || ''
    category = u.searchParams.get('category') || ''
  } catch { /* keep empty */ }
  const params = new URLSearchParams({ limit: '100' })
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?${params}`, {
      signal: controller.signal,
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      jobs?: Array<{
        title?: string; company_name?: string; url?: string
        candidate_required_location?: string; salary?: string
        description?: string; publication_date?: string; tags?: string[]
      }>
    }
    return (data.jobs ?? []).slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company: String(j.company_name ?? '').trim().slice(0, 120),
      link: sanitiseLink(String(j.url ?? ''), url),
      location: String(j.candidate_required_location ?? 'Remote').trim().slice(0, 120),
      salary: String(j.salary ?? '').trim().slice(0, 120),
      description: String(j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
      postedAt: j.publication_date ? new Date(j.publication_date) : null,
    }))
  } catch { return [] } finally { clearTimeout(timer) }
}

export const remotiveAdapter: Adapter = {
  name: 'remotive',
  matches: (url) => /remotive\.com/i.test(url),
  skipKeywordFilter: true,
  fetch: (source) => fetchRemotive(source.url),
}
