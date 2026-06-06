import { and, desc, eq, inArray, sql } from 'drizzle-orm'
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
  let updated = 0
  for (const id of ids) {
    await db.update(jobLeads).set({ status })
      .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, userId)))
    updated++
  }
  return { updated }
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
  // Tenancy: WHERE filters by userId so a leaked id from another
  // tenant silently no-ops.
  await db.delete(jobSources).where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
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

async function aiExtractJobs(userId: string, sourceText: string): Promise<ExtractedJob[]> {
  const creds = await getAiFor(userId)
  if (creds.source === 'none') throw new Error('No AI key configured (Settings → AI)')
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
    body: JSON.stringify({
      model: creds.model,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract job listings from page text. Return ONLY JSON:\n' +
            '{"jobs":[{"title":"…","company":"…","link":"…","location":"…","salary":"…","description":"…","posted_date":"…"}, ...]}.\n' +
            'Keep at most 100 entries. title is required; all other fields may be empty strings.\n' +
            'posted_date: ISO date string if the posting date is visible (e.g. "2024-05-15"), else "".\n' +
            'description: one-sentence job summary if visible, else "".\n' +
            'salary: salary or CTC range if visible, else "".\n' +
            'Do NOT invent data. Skip nav / cookie / footer text.\n' +
            'If the page has no jobs return {"jobs": []}.',
        },
        {
          role: 'user',
          content: `Extract jobs from this page text:\n\n${sourceText.slice(0, 25_000)}`,
        },
      ],
    }),
  })
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
      .slice(0, 100)
  } catch { return [] }
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
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
  const isFirstFetch = !source.lastFetchedAt
  const isNaukri = /naukri\.com/i.test(source.url)

  try {
    let jobs: ExtractedJob[]

    if (isNaukri) {
      // Bypass HTML fetch + AI — use Naukri's JSON search API directly.
      jobs = await fetchNaukriApi(source.url, isFirstFetch ? NAUKRI_FIRST_PAGES : NAUKRI_TICK_PAGES)
    } else {
      const fetched = await fetchForAi(source.url)
      if (!fetched.ok) {
        await db.update(jobSources).set({
          lastFetchedAt: Date.now(), lastStatus: 'fetch-failed', lastError: fetched.error.slice(0, 240),
        }).where(eq(jobSources.id, source.id))
        return { added: 0, status: 'fetch-failed', error: fetched.error }
      }
      jobs = await aiExtractJobs(source.userId, fetched.text)
    }

    // First fetch: take everything extracted. Ongoing: cap per tick.
    const batchCap = isFirstFetch ? jobs.length : MAX_NEW_PER_TICK
    let added = 0
    for (const j of jobs.slice(0, batchCap)) {
      if (!keywordsMatch(j.title, j.company ?? '', source.keywords)) continue
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
    await db.update(jobSources).set({
      lastFetchedAt: Date.now(),
      lastStatus: added > 0 ? `ok-${added}-new` : 'ok-no-new',
      lastError: '',
    }).where(eq(jobSources.id, source.id))
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
 * Run one tick across every active source for every user. Designed
 * to be called from the /api/cron/job-tracker endpoint (gated by
 * CRON_SECRET) every ~hour.
 *
 * Bounded by the per-source MAX_NEW_PER_TICK + a global LIMIT here so
 * a single cron invocation can't drag forever on a Vercel function.
 */
export async function tickAll(limit = 40): Promise<{ scanned: number; addedTotal: number }> {
  const sources = await db.select().from(jobSources)
    .where(eq(jobSources.active, true))
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

export { fingerprintOf, keywordsMatch }
