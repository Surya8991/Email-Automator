// ATS (Applicant Tracking System) adapters. All seven share the same
// JSON-fetch shape — host pattern detects which ATS, then we hit the
// vendor's public unauthenticated posting-list endpoint.

import type { Adapter, RawJob } from './types'
import { RSS_UA } from './types'
import { sanitiseLink } from './utils'

type AtsType = 'lever' | 'greenhouse' | 'ashby' | 'smartrecruiters' | 'breezy' | 'workable' | 'freshteam'

export function detectAts(url: string): { type: AtsType; company: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const seg = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] ?? ''
    if (host === 'jobs.lever.co' || host === 'lever.co') return seg ? { type: 'lever', company: seg } : null
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') return seg ? { type: 'greenhouse', company: seg } : null
    if (host === 'jobs.ashbyhq.com') return seg ? { type: 'ashby', company: seg } : null
    if (host === 'careers.smartrecruiters.com') return seg ? { type: 'smartrecruiters', company: seg } : null
    if (host.endsWith('.breezy.hr')) {
      const company = host.replace(/\.breezy\.hr$/, '')
      if (company) return { type: 'breezy', company }
    }
    if (host === 'apply.workable.com' || host === 'jobs.workable.com') return seg ? { type: 'workable', company: seg } : null
    if (host.endsWith('.freshteam.com')) {
      const company = host.replace(/\.freshteam\.com$/, '')
      if (company) return { type: 'freshteam', company }
    }
  } catch { /* invalid URL */ }
  return null
}

export async function fetchAtsApi(ats: { type: AtsType; company: string }): Promise<RawJob[]> {
  const { type, company } = ats
  const c = encodeURIComponent(company)

  if (type === 'lever') {
    const res = await fetch(`https://api.lever.co/v0/postings/${c}?mode=json`, {
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    }).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as Array<{
      text?: string; hostedUrl?: string; descriptionPlain?: string; createdAt?: number
      categories?: { location?: string; team?: string }
    }>
    return data.slice(0, 100).map((j) => ({
      title: String(j.text ?? '').trim().slice(0, 200),
      company,
      link: String(j.hostedUrl ?? '').trim().slice(0, 600),
      location: String(j.categories?.location ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.descriptionPlain ?? '').trim().slice(0, 2000),
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
    }))
  }

  if (type === 'greenhouse') {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs?content=true`, {
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    }).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as {
      jobs?: Array<{
        title?: string; absolute_url?: string; updated_at?: string; content?: string
        offices?: Array<{ name?: string }>
      }>
    }
    return (data.jobs ?? []).slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company,
      link: String(j.absolute_url ?? '').trim().slice(0, 600),
      location: String(j.offices?.[0]?.name ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.content ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    }))
  }

  if (type === 'ashby') {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-public/v1/job-board?organizationHostedJobsPageName=${c}`,
      { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } },
    ).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as {
      jobBoard?: {
        jobPostings?: Array<{
          title?: string; locationName?: string; externalLink?: string
          descriptionHtml?: string; publishedDate?: string; teamName?: string
          compensationTierSummary?: string
        }>
      }
    }
    return (data.jobBoard?.jobPostings ?? []).slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company,
      link: sanitiseLink(String(j.externalLink ?? ''), ''),
      location: String(j.locationName ?? '').trim().slice(0, 120),
      salary: String(j.compensationTierSummary ?? '').trim().slice(0, 120),
      description: String(j.descriptionHtml ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 2000),
      postedAt: j.publishedDate ? new Date(j.publishedDate) : null,
    }))
  }

  if (type === 'smartrecruiters') {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${c}/postings?limit=100&status=PUBLIC`,
      { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } },
    ).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as {
      content?: Array<{
        name?: string; ref?: string; releasedDate?: string
        location?: { city?: string; country?: string }
        department?: { label?: string }
      }>
    }
    return (data.content ?? []).slice(0, 100).map((j) => ({
      title: String(j.name ?? '').trim().slice(0, 200),
      company,
      link: j.ref ? `https://careers.smartrecruiters.com/${company}/${j.ref}` : '',
      location: [j.location?.city, j.location?.country].filter(Boolean).join(', ').slice(0, 120),
      salary: '',
      description: String(j.department?.label ?? '').trim().slice(0, 2000),
      postedAt: j.releasedDate ? new Date(j.releasedDate) : null,
    }))
  }

  if (type === 'breezy') {
    const res = await fetch(`https://${company}.breezy.hr/json`, {
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
    }).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as Array<{
      _id?: string; name?: string; type?: { name?: string }
      department?: { name?: string }; location?: { name?: string; city?: string; country?: { name?: string } }
      url?: string; published_date?: string
    }>
    return data.slice(0, 100).map((j) => ({
      title: String(j.name ?? '').trim().slice(0, 200),
      company,
      link: String(j.url ?? '').trim().slice(0, 600),
      location: String(j.location?.name ?? j.location?.city ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.department?.name ?? '').trim().slice(0, 2000),
      postedAt: j.published_date ? new Date(j.published_date) : null,
    }))
  }

  if (type === 'workable') {
    const res = await fetch(
      `https://apply.workable.com/api/v2/widget/accounts/${c}/jobs`,
      { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } },
    ).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as {
      results?: Array<{
        id?: string; title?: string; department?: string
        location?: { location_str?: string }; url?: string
        published_on?: string; employment_type?: string
      }>
    }
    return (data.results ?? []).slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company,
      link: String(j.url ?? `https://apply.workable.com/${company}/j/${j.id}`).trim().slice(0, 600),
      location: String(j.location?.location_str ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.employment_type ?? j.department ?? '').trim().slice(0, 2000),
      postedAt: j.published_on ? new Date(j.published_on) : null,
    }))
  }

  if (type === 'freshteam') {
    const res = await fetch(
      `https://${company}.freshteam.com/api/job_postings?status=published`,
      { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } },
    ).catch(() => null)
    if (!res?.ok) return []
    const data = (await res.json()) as Array<{
      id?: number; title?: string; department?: { name?: string }
      location?: { city?: string }; remote?: boolean
      job_posting_url?: string; updated_at?: string
    }>
    return data.slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company,
      link: String(j.job_posting_url ?? '').trim().slice(0, 600),
      location: j.remote ? 'Remote' : String(j.location?.city ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.department?.name ?? '').trim().slice(0, 2000),
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    }))
  }

  return []
}

export const atsAdapter: Adapter = {
  name: 'ats',
  matches: (url) => detectAts(url) !== null,
  fetch: async (source) => {
    const ats = detectAts(source.url)
    return ats ? fetchAtsApi(ats) : []
  },
}

/** Returns "ats:lever" / "ats:greenhouse" etc. for adapterMatched telemetry. */
export function atsSubtype(url: string): string | null {
  const ats = detectAts(url)
  return ats ? `ats:${ats.type}` : null
}
