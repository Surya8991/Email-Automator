// Generic RSS 2.0 feed parser. Covers Indeed, TimesJobs, HN Who-is-hiring,
// and any URL that returns XML with <item> blocks. Regex-extracted because
// the edge/server runtime has no DOMParser.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

export function isRssUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.pathname.endsWith('/rss') ||
      u.pathname.endsWith('/feed') ||
      u.pathname.endsWith('.xml') ||
      u.pathname.endsWith('/rss.xml') ||
      u.searchParams.has('format') ||
      /indeed\.com\/rss/i.test(url) ||
      /timesjobs\.com\/.*rss/i.test(url) ||
      /hnrss\.org/i.test(url)
    )
  } catch { return false }
}

function extractCdata(block: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`,
    'i',
  )
  const m = block.match(re)
  return ((m?.[1] ?? m?.[2]) || '').trim()
}

export async function fetchRss(url: string): Promise<RawJob[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': RSS_UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
    return itemBlocks.slice(0, 150).flatMap((item) => {
      const title = extractCdata(item, 'title')
      if (!title) return []
      const link  = extractCdata(item, 'link') || extractCdata(item, 'guid')
      const pubDate = extractCdata(item, 'pubDate') || extractCdata(item, 'dc:date')
      const descHtml = extractCdata(item, 'description')
      const descText = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)

      let company = extractCdata(item, 'author') || extractCdata(item, 'dc:creator') || ''
      let location = ''
      if (!company) {
        const cm = descHtml.match(/company[^:]*:\s*<\/b>\s*([^<\n]+)/i) ?? descHtml.match(/<b>([^<]+)<\/b>\s*<br/i)
        if (cm?.[1]) company = cm[1].trim().slice(0, 120)
      }
      const lm = descHtml.match(/location[^:]*:\s*<\/b>\s*([^<\n]+)/i) ?? descHtml.match(/\blocation\b[:\s]+([^<\n,]+)/i)
      if (lm?.[1]) location = lm[1].trim().slice(0, 120)

      const sm = descHtml.match(/salary[^:]*:\s*<\/b>\s*([^<\n]+)/i)
      const salary = sm?.[1] ? sm[1].trim().slice(0, 120) : ''

      let postedAt: Date | null = null
      if (pubDate) { const d = new Date(pubDate); if (!isNaN(d.getTime())) postedAt = d }

      return [{ title: title.slice(0, 200), company, link: sanitiseLink(link, url), location, salary, description: descText, postedAt }]
    })
  } catch { return [] } finally { clearTimeout(timer) }
}

export const rssAdapter: Adapter = {
  name: 'rss',
  matches: isRssUrl,
  skipKeywordFilter: true, // RSS feeds are usually pre-filtered by URL query
  fetch: (source) => fetchRss(source.url),
}
