// Personio — public XML feed. Common in EU/IN SaaS shops.
// Endpoint: https://{tenant}.jobs.personio.com/xml
// Returns ~100 jobs in a single payload, no pagination.
//
// Fields: <name> → title, <office> → location, <department>, <subcompany>
// → company. No salary in feed.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'

function parsePersonioUrl(url: string): { tenant: string; tld: string } | null {
  try {
    const u = new URL(url)
    const m = u.hostname.toLowerCase().match(/^([^.]+)\.jobs\.personio\.(com|de)$/)
    if (!m) return null
    return { tenant: m[1] ?? '', tld: m[2] ?? 'com' }
  } catch { return null }
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`, 'i')
  const m = block.match(re)
  return ((m?.[1] ?? m?.[2]) || '').trim()
}

export async function fetchPersonio(url: string): Promise<RawJob[]> {
  const parsed = parsePersonioUrl(url)
  if (!parsed) return []
  const feedUrl = `https://${parsed.tenant}.jobs.personio.${parsed.tld}/xml`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(feedUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': RSS_UA, Accept: 'application/xml, text/xml, */*' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const positions = xml.match(/<position[\s>][\s\S]*?<\/position>/gi) ?? []
    return positions.slice(0, 100).flatMap((block) => {
      const title = extractXmlTag(block, 'name')
      if (!title) return []
      const id = extractXmlTag(block, 'id')
      const department = extractXmlTag(block, 'department')
      const subcompany = extractXmlTag(block, 'subcompany')
      const office = extractXmlTag(block, 'office')
      const recruitingCategory = extractXmlTag(block, 'recruitingCategory')
      const descHtml = extractXmlTag(block, 'jobDescriptions') || extractXmlTag(block, 'description')
      const descText = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)
      return [{
        title: title.slice(0, 200),
        company: (subcompany || parsed.tenant).slice(0, 120),
        link: id ? `https://${parsed.tenant}.jobs.personio.${parsed.tld}/job/${id}` : '',
        location: office.slice(0, 120),
        salary: '',
        description: [department, recruitingCategory, descText].filter(Boolean).join(' · ').slice(0, 2000),
        postedAt: null,
      }]
    })
  } catch { return [] } finally { clearTimeout(timer) }
}

export const personioAdapter: Adapter = {
  name: 'personio',
  matches: (url) => /\.jobs\.personio\.(com|de)/i.test(url),
  fetch: (source) => fetchPersonio(source.url),
}
