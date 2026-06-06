/**
 * fetch-marketing-linkedin.ts
 *
 * Fetches marketing/DM job listings from LinkedIn's public guest API
 * (no auth required) + extra Remotive / Remote OK searches, then
 * inserts them directly into the job_leads table.
 *
 * LinkedIn guest endpoint: /jobs-guest/jobs/api/seeMoreJobPostings/search
 * Returns 10–25 job cards as HTML per call; paginate with start=0,25,50…
 *
 * Run:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
 *   npx tsx scripts/fetch-marketing-linkedin.ts
 */

if (!process.env.DATABASE_URL?.startsWith('libsql://')) {
  console.error('❌  Set DATABASE_URL=libsql://… and TURSO_AUTH_TOKEN=…'); process.exit(1)
}

import { eq, and, sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { jobLeads, jobSources } from '../server/db/schema'
import { normalizeSalary, normalizeLocation, crossKey } from '../server/services/normalize'
import { sanitiseLink } from '../server/services/job-adapters/utils'
import { getRssUA } from '../server/services/job-adapters/types'

const USER_ID = '2560e12a-5480-45e9-bb3d-52a5ef8eb70d'
const FIFTEEN_DAYS_AGO = Date.now() - 15 * 24 * 60 * 60 * 1_000

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Strip HTML tags and decode common entities. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** SHA-1 fingerprint for dedup — same as fingerprintOf in job-tracker.ts */
async function fingerprint(title: string, company: string): Promise<string> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const data = new TextEncoder().encode(`${norm(title)}|${norm(company)}`)
  const buf = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface RawJob {
  title: string; company: string; link: string; location: string
  salary?: string; description?: string; postedAt?: Date | null
}

/** Insert a batch of raw jobs under a given sourceId. Returns count added. */
async function insertJobs(sourceId: number, jobs: RawJob[]): Promise<number> {
  let added = 0, skipped = 0
  for (const j of jobs) {
    if (j.postedAt && j.postedAt.getTime() < FIFTEEN_DAYS_AGO) { skipped++; continue }
    const fp = await fingerprint(j.title, j.company)
    const cleanLink = sanitiseLink(j.link, '')
    const sal = normalizeSalary(j.salary ?? '')
    const loc = normalizeLocation(j.location ?? '')
    const ck  = crossKey(j.company, j.title, loc.norm)
    const cleanDesc = stripHtml(j.description ?? '')
    try {
      await db.insert(jobLeads).values({
        userId: USER_ID, sourceId,
        fingerprint: fp,
        title: j.title.slice(0, 200),
        company: j.company.slice(0, 120),
        link: cleanLink.slice(0, 600),
        location: (j.location ?? '').slice(0, 120),
        salary: (j.salary ?? '').slice(0, 120),
        description: cleanDesc.slice(0, 4000),
        postedAt: j.postedAt ?? null,
        salaryMin: sal.min, salaryMax: sal.max,
        salaryCcy: sal.ccy, salaryPeriod: sal.period,
        locationNorm: loc.norm, remoteScope: loc.remoteScope,
        crossKey: ck,
        status: 'new',
      })
      added++
    } catch {
      // unique constraint = already exists; skip
    }
  }
  return added
}

/** Get or create a "virtual" source row for a given fetcher label. */
async function ensureSource(label: string, url: string, keywords: string): Promise<number> {
  const existing = await db.select({ id: jobSources.id }).from(jobSources)
    .where(and(eq(jobSources.userId, USER_ID), eq(jobSources.url, url))).limit(1)
  if (existing[0]) return existing[0].id
  const rows = await db.insert(jobSources).values({
    userId: USER_ID, label, url, keywords,
    active: true, lastFetchedAt: null, lastStatus: '', lastError: '',
  }).returning({ id: jobSources.id })
  return rows[0]!.id
}

// ── LinkedIn guest HTML parser ────────────────────────────────────────────────

/**
 * Parse LinkedIn guest job-search HTML cards.
 * Extracts title, company, location, link, and posted date via regex.
 */
function parseLinkedInCards(html: string, sourceUrl: string): RawJob[] {
  const jobs: RawJob[] = []
  // Each card is wrapped in <li>...</li>
  const cards = html.match(/<li>[\s\S]*?<\/li>/g) ?? []
  for (const card of cards) {
    // Title
    const titleM = card.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i)
    const title = stripHtml(titleM?.[1] ?? '').trim()
    if (!title) continue

    // Company
    const companyM = card.match(/base-search-card__subtitle[\s\S]*?>([\s\S]*?)<\/h4>/i)
    const company = stripHtml(companyM?.[1] ?? '').trim()

    // Location
    const locM = card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)
    const location = stripHtml(locM?.[1] ?? '').trim()

    // URL
    const hrefM = card.match(/href="(https:\/\/[a-z]+\.linkedin\.com\/jobs\/view\/[^"]+)"/i)
    const link = hrefM?.[1] ? sanitiseLink(hrefM[1], sourceUrl) : ''

    // Posted date — <time datetime="2026-05-26">
    const dateM = card.match(/datetime="(\d{4}-\d{2}-\d{2})"/i)
    let postedAt: Date | null = null
    if (dateM?.[1]) {
      const d = new Date(dateM[1] + 'T00:00:00Z')
      if (!isNaN(d.getTime())) postedAt = d
    }

    if (title && (company || link)) {
      jobs.push({ title, company, link, location, postedAt })
    }
  }
  return jobs
}

async function fetchLinkedIn(query: string, location: string, maxPages: number): Promise<RawJob[]> {
  const all: RawJob[] = []
  const sourceUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`
  const headers = {
    'User-Agent': getRssUA(),
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.linkedin.com/',
  }

  for (let page = 0; page < maxPages; page++) {
    const start = page * 25
    const url = new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search')
    url.searchParams.set('keywords', query)
    url.searchParams.set('location', location)
    url.searchParams.set('start', String(start))
    url.searchParams.set('position', '1')
    url.searchParams.set('pageNum', '0')

    try {
      const res = await fetch(url.toString(), { headers })
      if (!res.ok) { console.log(`    LI ${query} p${page+1}: HTTP ${res.status}`); break }
      const html = await res.text()
      if (!html.trim() || html.trim() === '<!DOCTYPE html>') break
      const jobs = parseLinkedInCards(html, sourceUrl)
      if (jobs.length === 0) break
      all.push(...jobs)
      process.stdout.write(`(${jobs.length})`)
      await sleep(800) // polite delay
    } catch (e) {
      console.log(`    LI error: ${e instanceof Error ? e.message : e}`)
      break
    }
  }
  return all
}

// ── Remotive extended search ──────────────────────────────────────────────────

async function fetchRemotive(search: string): Promise<RawJob[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=100`
  const res = await fetch(url, { headers: { 'User-Agent': getRssUA(), Accept: 'application/json' } })
  if (!res.ok) return []
  const data = await res.json() as { jobs?: Array<{
    title: string; company_name: string; url: string; candidate_required_location: string
    salary?: string; description?: string; publication_date?: string
  }> }
  return (data.jobs ?? []).map(j => {
    let postedAt: Date | null = null
    if (j.publication_date) {
      const d = new Date(j.publication_date)
      if (!isNaN(d.getTime())) postedAt = d
    }
    return {
      title: j.title ?? '',
      company: j.company_name ?? '',
      link: j.url ?? '',
      location: j.candidate_required_location ?? '',
      salary: j.salary ?? '',
      description: stripHtml(j.description ?? '').slice(0, 2000),
      postedAt,
    }
  })
}

// ── Remote OK extended tags ───────────────────────────────────────────────────

async function fetchRemoteOK(tag: string): Promise<RawJob[]> {
  const res = await fetch(`https://remoteok.com/api?tags=${encodeURIComponent(tag)}`, {
    headers: { 'User-Agent': getRssUA(), Accept: 'application/json' }
  })
  if (!res.ok) return []
  const data = await res.json() as Array<{
    position?: string; company?: string; url?: string; location?: string
    salary_min?: number; salary_max?: number; description?: string; date?: string
  }>
  return data
    .filter(j => j.position) // first element is a metadata object
    .map(j => {
      let postedAt: Date | null = null
      if (j.date) { const d = new Date(j.date); if (!isNaN(d.getTime())) postedAt = d }
      const salary = j.salary_min && j.salary_max
        ? `$${Math.round(j.salary_min/1000)}k–$${Math.round(j.salary_max/1000)}k`
        : ''
      return {
        title: j.position ?? '',
        company: j.company ?? '',
        link: j.url ? `https://remoteok.com${j.url}` : '',
        location: j.location ?? 'Remote',
        salary,
        description: stripHtml(j.description ?? '').slice(0, 2000),
        postedAt,
      }
    })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📍 DB:   ${process.env.DATABASE_URL}`)
  console.log(`👤 User: ${USER_ID}\n`)

  // Current marketing count
  const before = await db.select({ n: sql<number>`COUNT(*)` }).from(jobLeads)
    .where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new'))).then(r => Number(r[0]?.n ?? 0))
  console.log(`📊 Current "new" leads: ${before}\n`)

  let totalAdded = 0

  // ── 1. LinkedIn — multiple marketing search terms × 4 pages (100 jobs each) ─
  const LI_SEARCHES: { query: string; location: string; pages: number }[] = [
    { query: 'digital marketing', location: 'India', pages: 4 },
    { query: 'SEO manager',       location: 'India', pages: 3 },
    { query: 'performance marketing', location: 'India', pages: 3 },
    { query: 'social media marketing', location: 'India', pages: 3 },
    { query: 'content marketing', location: 'India', pages: 3 },
    { query: 'growth marketing',  location: 'India', pages: 2 },
    { query: 'email marketing',   location: 'India', pages: 2 },
    { query: 'paid media',        location: 'India', pages: 2 },
    { query: 'PPC specialist',    location: 'India', pages: 2 },
    { query: 'brand marketing',   location: 'India', pages: 2 },
    { query: 'marketing manager', location: 'India', pages: 2 },
    { query: 'marketing executive', location: 'India', pages: 2 },
    { query: 'digital marketing', location: 'Bangalore', pages: 2 },
    { query: 'digital marketing', location: 'Mumbai', pages: 2 },
    { query: 'digital marketing', location: 'Remote', pages: 2 },
  ]

  for (const s of LI_SEARCHES) {
    const sourceLabel = `LinkedIn — ${s.query} (${s.location})`
    const sourceUrl   = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(s.query)}&location=${encodeURIComponent(s.location)}`
    const sourceId    = await ensureSource(sourceLabel, sourceUrl, s.query + ', digital marketing')

    process.stdout.write(`   ⏳ LinkedIn "${s.query}" (${s.location}) `)
    const jobs = await fetchLinkedIn(s.query, s.location, s.pages)
    const added = await insertJobs(sourceId, jobs)
    totalAdded += added
    console.log(` → +${added} new (${jobs.length} fetched)`)
    await sleep(1200) // polite delay between searches
  }

  // ── 2. Remotive — extended search terms ────────────────────────────────────
  const REMOTIVE_SEARCHES = [
    'seo', 'performance marketing', 'content marketing',
    'email marketing', 'growth hacking', 'paid media',
    'brand marketing', 'affiliate marketing',
  ]
  for (const q of REMOTIVE_SEARCHES) {
    const sourceLabel = `Remotive — ${q} (remote)`
    const sourceUrl   = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}`
    const sourceId    = await ensureSource(sourceLabel, sourceUrl, q)

    process.stdout.write(`   ⏳ Remotive "${q}" `)
    const jobs = await fetchRemotive(q)
    const added = await insertJobs(sourceId, jobs)
    totalAdded += added
    console.log(` → +${added} new (${jobs.length} fetched)`)
    await sleep(500)
  }

  // ── 3. Remote OK — more marketing tags ────────────────────────────────────
  const REMOTEOK_TAGS = [
    'growth', 'content', 'email-marketing', 'brand', 'ads',
    'social-media', 'digital-marketing', 'performance-marketing',
  ]
  for (const tag of REMOTEOK_TAGS) {
    const sourceLabel = `Remote OK — ${tag} (remote)`
    const sourceUrl   = `https://remoteok.com/api?tags=${tag}`
    const sourceId    = await ensureSource(sourceLabel, sourceUrl, tag)

    process.stdout.write(`   ⏳ RemoteOK "${tag}" `)
    const jobs = await fetchRemoteOK(tag)
    const added = await insertJobs(sourceId, jobs)
    totalAdded += added
    console.log(` → +${added} new (${jobs.length} fetched)`)
    await sleep(1000)
  }

  // Final count
  const after = await db.select({ n: sql<number>`COUNT(*)` }).from(jobLeads)
    .where(and(eq(jobLeads.userId, USER_ID), eq(jobLeads.status, 'new'))).then(r => Number(r[0]?.n ?? 0))

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✨  Done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Leads before      : ${before}
 New leads added   : ${totalAdded}
 Total "new" in DB : ${after}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)

  if (after >= 500) console.log('🎉  500+ leads ready — open /jobs!')
  else console.log('⚠️  Still under 500. Run again or add more sources.')
}

main().catch(e => { console.error('\n💥', e); process.exit(1) })
