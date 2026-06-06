// JSON-LD schema.org/JobPosting extractor. Most modern boards embed
// JobPosting JSON for Google Jobs indexing — title/company/salary all
// in explicit fields. Zero AI tokens.
//
// Unlike other adapters, json-ld doesn't fetch HTML itself — the orchestrator
// passes the raw HTML in (already fetched by fetchForAi). So this adapter
// is invoked manually as a fallback rather than via registry iteration.

import type { RawJob } from './types'
import { sanitiseLink } from './utils'

export function extractJsonLd(html: string, sourceUrl = ''): RawJob[] {
  const results: RawJob[] = []
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse((m[1] ?? '').trim()) as unknown
      const items: unknown[] = Array.isArray(data)
        ? data
        : (data as Record<string, unknown>)['@graph']
          ? ((data as Record<string, unknown>)['@graph'] as unknown[])
          : [data]
      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        const obj = item as Record<string, unknown>
        const type = obj['@type']
        const isJobPosting =
          type === 'JobPosting' ||
          (Array.isArray(type) && (type as string[]).includes('JobPosting'))
        if (!isJobPosting) continue
        const title = String(obj.title ?? obj.name ?? '').trim()
        if (!title) continue
        let company = ''
        if (typeof obj.hiringOrganization === 'object' && obj.hiringOrganization !== null) {
          company = String((obj.hiringOrganization as Record<string, unknown>).name ?? '').trim()
        }
        const link = sanitiseLink(String(obj.url ?? obj.sameAs ?? ''), sourceUrl)
        let location = ''
        if (typeof obj.jobLocation === 'object' && obj.jobLocation !== null) {
          const loc = obj.jobLocation as Record<string, unknown>
          if (typeof loc.address === 'object' && loc.address !== null) {
            const addr = loc.address as Record<string, unknown>
            location = String(addr.addressLocality ?? addr.addressRegion ?? addr.addressCountry ?? '').trim()
          } else {
            location = String(loc.name ?? '').trim()
          }
        } else if (typeof obj.jobLocation === 'string') {
          location = obj.jobLocation
        }
        let salary = ''
        if (typeof obj.baseSalary === 'object' && obj.baseSalary !== null) {
          const sal = obj.baseSalary as Record<string, unknown>
          const cur = String(sal.currency ?? '').trim()
          if (typeof sal.value === 'object' && sal.value !== null) {
            const v = sal.value as Record<string, unknown>
            salary = v.minValue && v.maxValue
              ? `${v.minValue}–${v.maxValue} ${cur}`.trim()
              : String(v.value ?? '').trim()
          }
        }
        const description = String(obj.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000)
        const postedStr = String(obj.datePosted ?? '').trim()
        let postedAt: Date | null = null
        if (postedStr) { const d = new Date(postedStr); if (!isNaN(d.getTime())) postedAt = d }
        results.push({
          title: title.slice(0, 200), company: company.slice(0, 120),
          link: link.slice(0, 600), location: location.slice(0, 120),
          salary: salary.slice(0, 120), description, postedAt,
        })
      }
    } catch { /* malformed JSON or wrong shape — skip */ }
  }
  return results
}
