import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { jobSources, jobLeads, type JobSource, type JobLead } from '@/server/db/schema'
import { fetchForAi } from './ai-generate'
import { getAiFor } from './credentials'
import { notify } from './notify'

// ── Job tracker service ─────────────────────────────────────────────
//
// Watches user-supplied job-board / careers URLs. On each tick:
//   1. Fetch the URL via the SSRF-defended fetcher (HTTPS-only in prod,
//      private-IP blocked, 1 MB cap, 5 s timeout, content-type guard).
//   2. Strip HTML to plain text.
//   3. Ask Groq to extract job listings as structured JSON.
//   4. Filter by the source's keyword list (if any).
//   5. Insert any new (sourceId, fingerprint) pairs into jobLeads.
//   6. Fire a notify webhook with the new-leads summary.
//
// Why not a dedicated scraper per board: the AI extraction is
// good-enough across LinkedIn / Lever / Greenhouse / Workday / Notion
// careers / company pages without per-site brittleness. Each fetch
// is bounded so a slow / hostile target can't tank the tick.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_NEW_PER_TICK = 50       // ongoing non-Naukri cap per tick
const NAUKRI_PER_PAGE = 100       // results per Naukri API page (their max)
const NAUKRI_FIRST_PAGES = 5      // first fetch: 5 pages × 100 = 500
const NAUKRI_TICK_PAGES = 1       // ongoing: 1 page × 100 = 100
// Sources are skipped by tickAll if fetched within this window.
// Manual refresh (tickSourceById) always bypasses this.
const FETCH_INTERVAL_MS = 12 * 60 * 60 * 1_000 // 12 hours

export async function listSources(userId: string): Promise<JobSource[]> {
  return db.select().from(jobSources).where(eq(jobSources.userId, userId)).orderBy(desc(jobSources.id))
}

/**
 * Per-source lead count (any status). Used in the Sources tab as a
 * quick indicator of which sources are pulling weight. Returns a
 * Map keyed by source id so the caller can join in O(1).
 */
export async function leadCountsBySource(userId: string): Promise<Map<number, number>> {
  const rows = await db.select({
    sourceId: jobLeads.sourceId,
    n: sql<number>`COUNT(*)`,
  }).from(jobLeads).where(eq(jobLeads.userId, userId)).groupBy(jobLeads.sourceId)
  return new Map(rows.map((r) => [r.sourceId, Number(r.n)]))
}

/**
 * Toggle a source between active and paused. Paused sources are
 * skipped by tickAll but kept in the list — useful when iterating on
 * keyword filters without losing the URL + history.
 */
export async function setSourceActive(userId: string, id: number, active: boolean): Promise<void> {
  await db.update(jobSources).set({ active })
    .where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
}

/**
 * Edit the label / url / keywords on a source without delete + recreate.
 * Returns the patched row so the UI can refresh state without a full
 * re-fetch.
 */
export async function updateSource(
  userId: string, id: number,
  patch: { label?: string; url?: string; keywords?: string },
): Promise<JobSource | null> {
  const clean: typeof patch = {}
  if (patch.label !== undefined) clean.label = patch.label.trim().slice(0, 120)
  if (patch.url !== undefined) clean.url = patch.url.trim().slice(0, 500)
  if (patch.keywords !== undefined) clean.keywords = patch.keywords.trim().slice(0, 400)
  if (Object.keys(clean).length === 0) return null
  await db.update(jobSources).set(clean)
    .where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
  const [row] = await db.select().from(jobSources)
    .where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
  return row ?? null
}

/**
 * Bulk-set status on a list of lead ids. Used by the bulk-triage
 * checkbox row in the leads table. Each id is filtered by userId so
 * a leaked id can't change another user's lead.
 */
export async function bulkSetLeadStatus(
  userId: string, ids: number[], status: 'new' | 'saved' | 'ignored' | 'applied',
): Promise<{ updated: number }> {
  if (!ids || ids.length === 0) return { updated: 0 }
  if (ids.length > 500) ids = ids.slice(0, 500)
  // Single UPDATE with inArray instead of N individual updates.
  await db.update(jobLeads).set({ status })
    .where(and(inArray(jobLeads.id, ids), eq(jobLeads.userId, userId)))
  return { updated: ids.length }
}

export async function listLeads(userId: string, status: string = 'new'): Promise<JobLead[]> {
  return db.select().from(jobLeads)
    .where(and(eq(jobLeads.userId, userId), eq(jobLeads.status, status)))
    .orderBy(desc(jobLeads.seenAt)).limit(500)
}

export async function createSource(
  userId: string, label: string, url: string, keywords: string,
): Promise<JobSource> {
  const inserted = await db.insert(jobSources).values({
    userId,
    label: label.trim().slice(0, 120),
    url: url.trim().slice(0, 500),
    keywords: keywords.trim().slice(0, 400),
  }).returning()
  return inserted[0]!
}

export async function deleteSource(userId: string, id: number): Promise<void> {
  await db.delete(jobSources).where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
}

export async function deleteAllSources(userId: string): Promise<{ deleted: number }> {
  const rows = await db.delete(jobSources)
    .where(eq(jobSources.userId, userId))
    .returning({ id: jobSources.id })
  return { deleted: rows.length }
}

export async function bulkDeleteSources(userId: string, ids: number[]): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 }
  const rows = await db.delete(jobSources)
    .where(and(inArray(jobSources.id, ids), eq(jobSources.userId, userId)))
    .returning({ id: jobSources.id })
  return { deleted: rows.length }
}

export async function bulkSetSourceActive(userId: string, ids: number[], active: boolean): Promise<void> {
  if (ids.length === 0) return
  await db.update(jobSources).set({ active })
    .where(and(inArray(jobSources.id, ids), eq(jobSources.userId, userId)))
}

export async function setLeadStatus(
  userId: string, id: number, status: 'new' | 'saved' | 'ignored' | 'applied',
): Promise<void> {
  await db.update(jobLeads).set({ status })
    .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, userId)))
}

/**
 * Extract jobs from the fetched page text via Groq. Returns a small
 * list of {title, company?, link?, location?} objects. Errors return
 * an empty list so the tick proceeds for other sources.
 */
type ExtractedJob = {
  title: string; company?: string; link?: string; location?: string
  salary?: string; description?: string; postedAt?: Date | null
}

// For job extraction we pin llama-3.1-8b-instant regardless of the user's
// model setting. The 70b-versatile model has only 12k TPM (tokens/min) on
// Groq's free tier — 3 HTML pages' worth — making bulk refreshes impossible.
// The 8b-instant model has 500k+ TPM at the same quality for JSON extraction.
const JOB_EXTRACT_MODEL = 'llama-3.1-8b-instant'
// Keep text small: 8k chars ≈ 2k input tokens, well within one minute's budget
// even with 30 concurrent AI sources. Quality is unchanged — job listings are
// almost always in the first 8k chars of a page.
const JOB_EXTRACT_CHARS = 8_000
// Fallback model if the primary hits a rate limit (different quota bucket).
// gemma2-9b-it was decommissioned by Groq in June 2026 — replaced with
// llama3-8b-8192 which sits in a separate quota bucket from 8b-instant.
const JOB_EXTRACT_FALLBACK = 'llama3-8b-8192'

async function aiExtractJobs(userId: string, sourceText: string): Promise<ExtractedJob[]> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('No AI key configured (Settings → AI)')

  const SYSTEM_PROMPT =
    'Extract job listings from the page text. Return ONLY valid JSON:\n' +
    '{"jobs":[{"title":"…","company":"…","link":"…","location":"…","salary":"…","description":"…","posted_date":"…"}]}.\n' +
    'title is required; all other fields may be empty strings. Keep ≤50 entries.\n' +
    'posted_date: ISO date string if visible, else "". description: one-sentence summary.\n' +
    'Do NOT invent data. Skip nav/cookie/footer. If no jobs: {"jobs":[]}'

  const models = [JOB_EXTRACT_MODEL, JOB_EXTRACT_FALLBACK, creds.model].filter(Boolean)

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Page text:\n\n${sourceText.slice(0, JOB_EXTRACT_CHARS)}` },
          ],
        }),
      })

      if (res.status === 429) {
        // Retry-After header tells us how long to wait; fall back to 20s
        const wait = Math.min(Number(res.headers.get('retry-after') || 20) * 1000, 30_000)
        if (attempt < 2) { await new Promise((r) => setTimeout(r, wait)); continue }
        // Second attempt also 429 → try next model in the list
        break
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`)
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const txt = data.choices?.[0]?.message?.content ?? '{}'
      try {
        const parsed = JSON.parse(txt) as {
          jobs?: Array<{ title?: unknown; company?: unknown; link?: unknown; location?: unknown; salary?: unknown; description?: unknown; posted_date?: unknown }>
        }
        if (!Array.isArray(parsed.jobs)) return []
        return parsed.jobs
          .filter((j) => typeof j.title === 'string' && (j.title as string).trim())
          .map((j) => {
            const pd = typeof j.posted_date === 'string' ? j.posted_date.trim() : ''
            let postedAt: Date | null = null
            if (pd) { const d = new Date(pd); if (!isNaN(d.getTime())) postedAt = d }
            return {
              title: String(j.title).trim().slice(0, 200),
              company: typeof j.company === 'string' ? j.company.trim().slice(0, 120) : '',
              link: typeof j.link === 'string' ? j.link.trim().slice(0, 600) : '',
              location: typeof j.location === 'string' ? j.location.trim().slice(0, 120) : '',
              salary: typeof j.salary === 'string' ? j.salary.trim().slice(0, 120) : '',
              description: typeof j.description === 'string' ? j.description.trim().slice(0, 400) : '',
              postedAt,
            }
          })
          .slice(0, 50)
      } catch { return [] }
    }
  }
  throw new Error('All Groq models rate-limited — try again in 1 minute')
}

// ── RSS feed parser ──────────────────────────────────────────────────
// Indeed (and many other boards) block HTML scraping but expose public
// RSS 2.0 feeds. We parse them with a regex extractor — no DOM/DOMParser
// available in the edge/server runtime.
//
// Indeed RSS format:
//   https://www.indeed.com/rss?q={role}&l={location}
//   https://in.indeed.com/rss?q={role}&l={location}
//
// TimesJobs and other boards also emit standard RSS so this path covers
// any URL that returns XML with <item> blocks.

// Indeed and several India boards actively block bot User-Agent strings.
// Using a plausible Chrome UA causes them to return results normally.
const RSS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function isRssUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.pathname.endsWith('/rss') ||
      u.pathname.endsWith('/feed') ||
      u.pathname.endsWith('.xml') ||
      u.pathname.endsWith('/rss.xml') ||
      u.searchParams.has('format') ||
      /indeed\.com\/rss/i.test(url) ||
      /timesjobs\.com\/.*rss/i.test(url)
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

async function fetchRss(url: string): Promise<ExtractedJob[]> {
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
      const descText = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)

      // Indeed encodes company + location inside description HTML as
      // <b>Company Name</b>: Foo ... <b>Location</b>: Bar, City
      let company = extractCdata(item, 'author') || extractCdata(item, 'dc:creator') || ''
      let location = ''
      if (!company) {
        const cm = descHtml.match(/company[^:]*:\s*<\/b>\s*([^<\n]+)/i) ?? descHtml.match(/<b>([^<]+)<\/b>\s*<br/i)
        if (cm?.[1]) company = cm[1].trim().slice(0, 120)
      }
      const lm = descHtml.match(/location[^:]*:\s*<\/b>\s*([^<\n]+)/i) ?? descHtml.match(/\blocation\b[:\s]+([^<\n,]+)/i)
      if (lm?.[1]) location = lm[1].trim().slice(0, 120)

      // Salary if present
      const sm = descHtml.match(/salary[^:]*:\s*<\/b>\s*([^<\n]+)/i)
      const salary = sm?.[1] ? sm[1].trim().slice(0, 120) : ''

      let postedAt: Date | null = null
      if (pubDate) { const d = new Date(pubDate); if (!isNaN(d.getTime())) postedAt = d }

      return [{ title: title.slice(0, 200), company, link: link.slice(0, 600), location, salary, description: descText, postedAt }]
    })
  } catch { return [] } finally { clearTimeout(timer) }
}

// ── Remote OK JSON API ───────────────────────────────────────────────
// remoteok.com/api returns a public JSON array. The first element is a
// legal notice object (skipped). Each job has title, company, location,
// description, salary, date, and a url field.

function isRemoteOkUrl(url: string): boolean {
  return /remoteok\.com/i.test(url)
}

// ── Remotive public JSON API ─────────────────────────────────────────
// remotive.com/api/remote-jobs — no auth, returns up to 500 jobs.
// We map the URL query to the API search param so a URL like
// remotive.com/remote-jobs?search=marketing works as expected.

function isRemotiveUrl(url: string): boolean {
  return /remotive\.com/i.test(url)
}

async function fetchRemotive(url: string): Promise<ExtractedJob[]> {
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
      link: String(j.url ?? '').trim().slice(0, 600),
      location: String(j.candidate_required_location ?? 'Remote').trim().slice(0, 120),
      salary: String(j.salary ?? '').trim().slice(0, 120),
      description: String(j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
      postedAt: j.publication_date ? new Date(j.publication_date) : null,
    }))
  } catch { return [] } finally { clearTimeout(timer) }
}

// ── Foundit (Monster India) internal API ────────────────────────────
// Foundit.in is one of India's largest job boards. Their internal
// search API mirrors the Naukri pattern — slug-based URL with a
// hidden JSON backend. Detected from URL shape.

function isFounditUrl(url: string): boolean {
  return /foundit\.in/i.test(url)
}

function parseFounditSlug(url: string): { keyword: string; location: string } | null {
  try {
    const u = new URL(url)
    if (!/foundit\.in$/i.test(u.hostname)) return null
    // Pattern: /j/{role}-jobs or /srp/results?searchKey=...
    const sq = u.searchParams.get('searchKey') || u.searchParams.get('query') || ''
    if (sq) return { keyword: sq, location: u.searchParams.get('location') || '' }
    // Slug path: /j/{role}-jobs-in-{city} or /j/{role}-jobs
    const slug = u.pathname.replace(/^\/j\/|^\/|\/$/g, '')
    const m = slug.match(/^(.+?)-jobs(?:-in-(.+))?$/)
    if (!m) return null
    return { keyword: (m[1] ?? '').replace(/-/g, ' '), location: (m[2] ?? '').replace(/-/g, ' ') }
  } catch { return null }
}

async function fetchFounditApi(url: string): Promise<ExtractedJob[]> {
  const parsed = parseFounditSlug(url)
  if (!parsed) return []
  const { keyword, location } = parsed
  const apiUrl = new URL('https://www.foundit.in/middleware/jobsearch/v1/find')
  apiUrl.searchParams.set('sort', '1')
  apiUrl.searchParams.set('rows', '30')
  apiUrl.searchParams.set('start', '0')
  apiUrl.searchParams.set('query', keyword)
  if (location) apiUrl.searchParams.set('location', location)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(apiUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': RSS_UA,
        Accept: 'application/json',
        Referer: 'https://www.foundit.in/',
        Origin: 'https://www.foundit.in',
      },
    })
    if (!res.ok) return []
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
    return jobs.slice(0, 100).map((j) => {
      const salary = j.minSal && j.maxSal ? `${j.minSal}–${j.maxSal} LPA` : ''
      const link = j.jobId ? `https://www.foundit.in/job/details/${j.jobId}` : ''
      return {
        title: String(j.title ?? '').trim().slice(0, 200),
        company: String(j.companyName ?? '').trim().slice(0, 120),
        link: link.slice(0, 600),
        location: (j.locations ?? []).join(', ').slice(0, 120),
        salary,
        description: String(j.jobDescription ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
        postedAt: j.modifiedDate ? new Date(j.modifiedDate) : null,
      }
    })
  } catch { return [] } finally { clearTimeout(timer) }
}

async function fetchRemoteOk(url: string): Promise<ExtractedJob[]> {
  // Build the API URL from the human-readable URL.
  // remoteok.com/remote-seo-jobs → /api?tags=seo
  // remoteok.com/api?tags=seo  → pass through
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
        const salary = j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k–$${Math.round(j.salary_max / 1000)}k`
          : ''
        return {
          title: (j.position ?? '').trim().slice(0, 200),
          company: (j.company ?? '').trim().slice(0, 120),
          link: (j.url ?? '').trim().slice(0, 600),
          location: (j.location ?? '').trim().slice(0, 120),
          description: (j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
          salary,
          postedAt,
        }
      })
  } catch { return [] } finally { clearTimeout(timer) }
}

// ── Naukri direct API ────────────────────────────────────────────────
// Naukri is JS-rendered so plain HTML fetch returns an empty shell.
// Their internal search API returns structured JSON without auth.
// URL pattern: naukri.com/{role-slug}-jobs[-in-{location-slug}]

function parseNaukriSlug(url: string): { keyword: string; location: string } | null {
  try {
    const u = new URL(url)
    if (!/naukri\.com$/i.test(u.hostname)) return null
    const slug = u.pathname.replace(/^\/|\/$/g, '')
    const m = slug.match(/^(.+?)-jobs(?:-in-(.+))?$/)
    if (!m) return null
    return {
      keyword: (m[1] ?? '').replace(/-/g, ' '),
      location: (m[2] ?? '').replace(/-/g, ' '),
    }
  } catch { return null }
}

async function fetchNaukriApi(url: string, pages: number): Promise<ExtractedJob[]> {
  const parsed = parseNaukriSlug(url)
  if (!parsed) return []
  const { keyword, location } = parsed
  const results: ExtractedJob[] = []

  for (let page = 1; page <= pages; page++) {
    const apiUrl = new URL('https://www.naukri.com/jobapi/v3/search')
    apiUrl.searchParams.set('noOfResults', String(NAUKRI_PER_PAGE))
    apiUrl.searchParams.set('urlType', 'search_by_keyword')
    apiUrl.searchParams.set('searchType', 'adv')
    apiUrl.searchParams.set('keyword', keyword)
    if (location) apiUrl.searchParams.set('location', location)
    apiUrl.searchParams.set('pageNo', String(page))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          appid: '109', systemid: '109',
          'User-Agent': RSS_UA,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.naukri.com/',
          Origin: 'https://www.naukri.com',
        },
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        jobDetails?: Array<{
          title?: string; companyName?: string; jdURL?: string
          placeholders?: Array<{ label?: string; title?: string }>
          jobDescription?: string; createdDate?: string | number
        }>
      }
      const jobs = data.jobDetails ?? []
      if (jobs.length === 0) break
      for (const j of jobs) {
        const ph = (label: string) => j.placeholders?.find((p) => p.label === label)?.title ?? ''
        let postedAt: Date | null = null
        if (j.createdDate) {
          const d = new Date(Number(j.createdDate))
          if (!isNaN(d.getTime())) postedAt = d
        }
        results.push({
          title: (j.title ?? '').trim().slice(0, 200),
          company: (j.companyName ?? '').trim().slice(0, 120),
          link: (j.jdURL ?? '').trim().slice(0, 600),
          location: ph('location').slice(0, 120),
          salary: ph('salary').slice(0, 120),
          description: (j.jobDescription ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
          postedAt,
        })
      }
      if (jobs.length < NAUKRI_PER_PAGE) break // last page
    } catch { break } finally { clearTimeout(timer) }
  }
  return results
}

// ── JSON-LD structured data extractor ───────────────────────────────
// Most modern job boards (LinkedIn, Glassdoor, company pages) embed
// schema.org JobPosting objects in <script type="application/ld+json">
// for Google Jobs indexing. Parsing this is zero-cost, zero-AI, and
// highly structured — title/company/location/salary are explicit fields.

function extractJsonLd(html: string): ExtractedJob[] {
  const results: ExtractedJob[] = []
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
        const link = String(obj.url ?? obj.sameAs ?? '').trim()
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
        const description = String(obj.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400)
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

// ── ATS (Applicant Tracking System) API fetchers ─────────────────────
// Lever, Greenhouse, Ashby, and SmartRecruiters all expose public
// unauthenticated JSON APIs used by their own embed widgets. These are
// far more reliable than HTML scraping or AI extraction because:
//   • Structured fields — title, company, location, salary, link
//   • No bot blocking (they're public APIs, not pages)
//   • Zero AI tokens consumed

type AtsType = 'lever' | 'greenhouse' | 'ashby' | 'smartrecruiters' | 'breezy' | 'workable' | 'freshteam'
function detectAts(url: string): { type: AtsType; company: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const seg = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] ?? ''
    if (host === 'jobs.lever.co' || host === 'lever.co') return seg ? { type: 'lever', company: seg } : null
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') return seg ? { type: 'greenhouse', company: seg } : null
    if (host === 'jobs.ashbyhq.com') return seg ? { type: 'ashby', company: seg } : null
    if (host === 'careers.smartrecruiters.com') return seg ? { type: 'smartrecruiters', company: seg } : null
    // BreezyHR: company.breezy.hr
    if (host.endsWith('.breezy.hr')) {
      const company = host.replace(/\.breezy\.hr$/, '')
      if (company) return { type: 'breezy', company }
    }
    // Workable: apply.workable.com/company or jobs.workable.com/company
    if (host === 'apply.workable.com' || host === 'jobs.workable.com') return seg ? { type: 'workable', company: seg } : null
    // Freshteam: company.freshteam.com
    if (host.endsWith('.freshteam.com')) {
      const company = host.replace(/\.freshteam\.com$/, '')
      if (company) return { type: 'freshteam', company }
    }
  } catch { /* invalid URL */ }
  return null
}

async function fetchAtsApi(ats: { type: AtsType; company: string }): Promise<ExtractedJob[]> {
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
      description: String(j.descriptionPlain ?? '').trim().slice(0, 400),
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
      description: String(j.content ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
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
        }>
      }
    }
    return (data.jobBoard?.jobPostings ?? []).slice(0, 100).map((j) => ({
      title: String(j.title ?? '').trim().slice(0, 200),
      company,
      link: String(j.externalLink ?? '').trim().slice(0, 600),
      location: String(j.locationName ?? '').trim().slice(0, 120),
      salary: '',
      description: String(j.descriptionHtml ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
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
      description: String(j.department?.label ?? '').trim().slice(0, 400),
      postedAt: j.releasedDate ? new Date(j.releasedDate) : null,
    }))
  }

  if (type === 'breezy') {
    // BreezyHR public JSON endpoint — no auth required for published jobs
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
      description: String(j.department?.name ?? '').trim().slice(0, 400),
      postedAt: j.published_date ? new Date(j.published_date) : null,
    }))
  }

  if (type === 'workable') {
    // Workable widget API — used by their embeddable job board
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
      description: String(j.employment_type ?? j.department ?? '').trim().slice(0, 400),
      postedAt: j.published_on ? new Date(j.published_on) : null,
    }))
  }

  if (type === 'freshteam') {
    // Freshteam (Freshworks ATS) public careers API
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
      description: String(j.department?.name ?? '').trim().slice(0, 400),
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    }))
  }

  return []
}

/**
 * Stable fingerprint for dedupe. Title + company, lowercased + trimmed.
 * Two listings with the same title but different company are treated
 * as distinct.
 */
function fingerprintOf(title: string, company: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return `${norm(title)}|${norm(company)}`
}

function keywordsMatch(title: string, company: string, keywords: string): boolean {
  if (!keywords.trim()) return true
  const words = keywords.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
  if (words.length === 0) return true
  const hay = `${title} ${company}`.toLowerCase()
  return words.some((w) => hay.includes(w))
}

/**
 * Run one tick for a single source. Returns the count of new leads
 * stored. Wraps every step in try/catch so partial failures still
 * record `lastStatus` / `lastError` on the source for visibility.
 */
export async function tickSource(source: JobSource): Promise<{ added: number; status: string; error?: string }> {
  const isFirstFetch    = !source.lastFetchedAt
  const isNaukri        = /naukri\.com/i.test(source.url)
  const isRss           = isRssUrl(source.url)
  const isRemoteOk      = isRemoteOkUrl(source.url)
  const isRemotive      = isRemotiveUrl(source.url)
  const isFoundit       = isFounditUrl(source.url)
  // Sources whose search API already filters by keyword — skip post-fetch keywordsMatch.
  // Also skip when the source URL already encodes the keyword (e.g. Internshala
  // with ?categories=Paid%20Media, or any board where the role is in the path/query).
  const urlAlreadyFiltered = (() => {
    if (!source.keywords.trim()) return false
    try {
      const urlDecoded = decodeURIComponent(source.url).toLowerCase()
      return source.keywords
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .some((kw) =>
          urlDecoded.includes(kw) ||
          urlDecoded.includes(kw.replace(/\s+/g, '-')) ||
          urlDecoded.includes(kw.replace(/\s+/g, '+')) ||
          urlDecoded.includes(kw.replace(/\s+/g, '_')),
        )
    } catch { return false }
  })()
  const skipKwFilter = isNaukri || isRss || isRemoteOk || isRemotive || isFoundit || urlAlreadyFiltered

  try {
    let jobs: ExtractedJob[] = []

    if (isNaukri) {
      // Naukri internal JSON API — bypasses JS-rendered HTML.
      // If the API returns empty (e.g. Vercel IPs blocked → HTTP 406),
      // fall through to the generic HTML → JSON-LD → AI path.
      jobs = await fetchNaukriApi(source.url, isFirstFetch ? NAUKRI_FIRST_PAGES : NAUKRI_TICK_PAGES)
    } else if (isFoundit) {
      // Foundit internal API — fall through on empty (API may not be public)
      jobs = await fetchFounditApi(source.url)
    } else if (isRss) {
      jobs = await fetchRss(source.url)
    } else if (isRemoteOk) {
      jobs = await fetchRemoteOk(source.url)
    } else if (isRemotive) {
      jobs = await fetchRemotive(source.url)
    }

    // Generic fallback path — runs for non-structured sources AND as a
    // safety net when a dedicated fetcher above returns 0 (e.g. Naukri
    // API blocked by host IP, Foundit API returning 404, RSS returning 0).
    // Priority: ATS public API → JSON-LD structured data → AI extraction.
    if (jobs.length === 0 && !isRss && !isRemoteOk && !isRemotive) {
      // 1. ATS JSON API (Lever / Greenhouse / Ashby / SmartRecruiters /
      //    BreezyHR / Workable / Freshteam) — structured, zero AI tokens.
      const ats = detectAts(source.url)
      if (ats) jobs = await fetchAtsApi(ats)

      if (jobs.length === 0) {
        // 2 + 3. Fetch HTML then try JSON-LD, fall back to AI.
        const fetched = await fetchForAi(source.url)
        if (!fetched.ok) {
          await db.update(jobSources).set({
            lastFetchedAt: Date.now(), lastStatus: 'fetch-failed', lastError: fetched.error.slice(0, 240),
          }).where(eq(jobSources.id, source.id))
          return { added: 0, status: 'fetch-failed', error: fetched.error }
        }
        // 2. JSON-LD schema.org/JobPosting — covers LinkedIn, Glassdoor,
        //    company career pages that embed Google Jobs markup.
        jobs = extractJsonLd(fetched.rawHtml)
        // 3. AI — last resort when no structured data found.
        if (jobs.length === 0) {
          jobs = await aiExtractJobs(source.userId, fetched.text)
        }
      }
    }

    // First fetch: take everything extracted. Ongoing: cap per tick.
    const batchCap = isFirstFetch ? jobs.length : MAX_NEW_PER_TICK
    let added = 0
    for (const j of jobs.slice(0, batchCap)) {
      // For keyword-targeted fetchers (Naukri API, RSS, Remote OK) the
      // source already searched for the right role — skip the post-fetch
      // keyword filter so broadly-titled but relevant jobs aren't dropped.
      if (!skipKwFilter && !keywordsMatch(j.title, j.company ?? '', source.keywords)) continue
      const fp = fingerprintOf(j.title, j.company ?? '')
      try {
        await db.insert(jobLeads).values({
          userId: source.userId, sourceId: source.id,
          fingerprint: fp,
          title: j.title,
          company: j.company ?? '',
          link: j.link ?? '',
          location: j.location ?? '',
          salary: j.salary ?? '',
          description: j.description ?? '',
          postedAt: j.postedAt ?? null,
        })
        added++
      } catch {
        // Unique-index violation = already seen this lead. Skip.
      }
    }
    // Only stamp lastFetchedAt when the source actually returned raw
    // jobs. If the API/page returned 0 results (likely blocked or
    // network error), leave lastFetchedAt null so the next tick still
    // treats this as a first fetch and uses the larger page budget.
    const updatePayload: Record<string, unknown> = {
      lastStatus: added > 0 ? `ok-${added}-new` : `ok-no-new(${jobs.length}raw)`,
      lastError: '',
    }
    if (jobs.length > 0) updatePayload.lastFetchedAt = Date.now()
    await db.update(jobSources).set(updatePayload).where(eq(jobSources.id, source.id))
    if (added > 0) {
      await notify(source.userId, 'send.completed', {
        title: `Job tracker: ${added} new ${added === 1 ? 'lead' : 'leads'}`,
        detail: `From source "${source.label}". Open /jobs to triage.`,
        meta: { source: source.label, new_leads: added },
      }).catch(() => {})
    }
    return { added, status: 'ok' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tick failed'
    await db.update(jobSources).set({
      lastFetchedAt: Date.now(), lastStatus: 'error', lastError: msg.slice(0, 240),
    }).where(eq(jobSources.id, source.id))
    return { added: 0, status: 'error', error: msg }
  }
}

/**
 * Run one tick across every active source for every user. Called from
 * the /api/cron/job-tracker endpoint every ~hour. Skips sources that
 * were successfully fetched within FETCH_INTERVAL_MS (12 h) so each
 * source is refreshed at most twice a day regardless of cron frequency.
 *
 * Manual refresh (tickSourceById / refreshAllForUserAction) bypasses
 * this cooldown — the user explicitly asked for a fresh pull.
 */
export async function tickAll(limit = 40): Promise<{ scanned: number; addedTotal: number }> {
  const cutoff = Date.now() - FETCH_INTERVAL_MS
  const sources = await db.select().from(jobSources)
    .where(and(
      eq(jobSources.active, true),
      or(isNull(jobSources.lastFetchedAt), lt(jobSources.lastFetchedAt, cutoff)),
    ))
    .limit(limit)
  let addedTotal = 0
  for (const s of sources) {
    const r = await tickSource(s)
    addedTotal += r.added
  }
  return { scanned: sources.length, addedTotal }
}

/**
 * Manual on-demand tick for a single source — invoked from the /jobs
 * UI so the user can refresh a source without waiting for cron.
 */
export async function tickSourceById(userId: string, sourceId: number): Promise<{ added: number; status: string; error?: string }> {
  const [s] = await db.select().from(jobSources)
    .where(and(eq(jobSources.id, sourceId), eq(jobSources.userId, userId)))
  if (!s) return { added: 0, status: 'not-found' }
  return tickSource(s)
}

export { fingerprintOf, keywordsMatch, aiExtractJobs as aiExtractJobsPublic, fetchNaukriApi as fetchNaukriApiPublic }
