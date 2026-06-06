// Teamtailor — Nordic/EU ATS. Public posting-list endpoint shape varies
// per tenant; this adapter tries the most common pattern and falls back
// to JSON-LD on the search page if zero results.
//
// Endpoint: https://{tenant}.teamtailor.com/jobs.json (older tenants)
//        OR https://career.{company}.com/jobs.json (white-labeled)

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

function parseTeamtailorUrl(url: string): { origin: string; tenant: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const m = host.match(/^([^.]+)\.teamtailor\.com$/)
    if (m) return { origin: u.origin, tenant: m[1] ?? '' }
    // White-labeled — only flag if path/url already strongly suggests Teamtailor
    if (/career\./i.test(host)) {
      const tenant = host.replace(/^career\./i, '').split('.')[0] ?? ''
      return { origin: u.origin, tenant }
    }
    return null
  } catch { return null }
}

export async function fetchTeamtailor(url: string): Promise<RawJob[]> {
  const parsed = parseTeamtailorUrl(url)
  if (!parsed) return []
  const apiUrl = `${parsed.origin}/jobs.json`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      console.warn(`[teamtailor] ${parsed.tenant}: ${res.status} — endpoint may have changed`)
      return []
    }
    const data = (await res.json()) as
      | { jobs?: Array<{ title?: string; location?: string; department?: string; url?: string; created_at?: string; description?: string }> }
      | { data?: Array<{ attributes?: { title?: string; pitch?: string; 'created-at'?: string }; links?: { 'careersite-job-url'?: string } }> }
    // Shape A: { jobs: [...] }
    if ('jobs' in data && Array.isArray(data.jobs)) {
      return data.jobs.slice(0, 100).map((j) => ({
        title: String(j.title ?? '').trim().slice(0, 200),
        company: parsed.tenant.charAt(0).toUpperCase() + parsed.tenant.slice(1),
        link: sanitiseLink(String(j.url ?? ''), url),
        location: String(j.location ?? '').trim().slice(0, 120),
        salary: '',
        description: String(j.description ?? j.department ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
        postedAt: j.created_at ? new Date(j.created_at) : null,
      }))
    }
    // Shape B: JSON:API { data: [{attributes, links}] }
    if ('data' in data && Array.isArray(data.data)) {
      return data.data.slice(0, 100).map((j) => ({
        title: String(j.attributes?.title ?? '').trim().slice(0, 200),
        company: parsed.tenant.charAt(0).toUpperCase() + parsed.tenant.slice(1),
        link: sanitiseLink(String(j.links?.['careersite-job-url'] ?? ''), url),
        location: '',
        salary: '',
        description: String(j.attributes?.pitch ?? '').slice(0, 2000),
        postedAt: j.attributes?.['created-at'] ? new Date(j.attributes['created-at']) : null,
      }))
    }
    return []
  } catch { return [] } finally { clearTimeout(timer) }
}

export const teamtailorAdapter: Adapter = {
  name: 'teamtailor',
  matches: (url) => /\.teamtailor\.com/i.test(url),
  fetch: (source) => fetchTeamtailor(source.url),
}
