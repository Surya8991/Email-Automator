/**
 * One-time job pull against production Turso.
 * Run with:
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... GROQ_API_KEY=gsk_... npx tsx scripts/pull-jobs-now.ts
 *
 * Reads every active source, fetches jobs via the same waterfall used in
 * tickSource (Naukri API → RSS → ATS API → JSON-LD → AI), inserts new leads.
 */
import { createClient } from '@libsql/client'

const DB_URL   = process.env.DATABASE_URL!
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN!
const GROQ_KEY = process.env.GROQ_API_KEY || ''
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

if (!DB_URL || !DB_TOKEN) { console.error('DATABASE_URL and TURSO_AUTH_TOKEN required'); process.exit(1) }
if (!GROQ_KEY) console.warn('[warn] GROQ_API_KEY not set — AI extraction will be skipped')

const client = createClient({ url: DB_URL, authToken: DB_TOKEN })
const RSS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ── Helpers ──────────────────────────────────────────────────────────

function norm(s: string) { return s.toLowerCase().replace(/\s+/g, ' ').trim() }
function fingerprint(title: string, company: string) { return `${norm(title)}|${norm(company)}` }

function extractCdata(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`, 'i')
  const m = block.match(re)
  return ((m?.[1] ?? m?.[2]) || '').trim()
}

function extractJsonLd(html: string): Job[] {
  const results: Job[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse((m[1] ?? '').trim()) as unknown
      const items: unknown[] = Array.isArray(data) ? data : [(data as any)['@graph'] ? (data as any)['@graph'] : data].flat()
      for (const item of items) {
        if (typeof item !== 'object' || !item) continue
        const obj = item as any
        if (obj['@type'] !== 'JobPosting' && !(Array.isArray(obj['@type']) && obj['@type'].includes('JobPosting'))) continue
        const title = String(obj.title ?? obj.name ?? '').trim()
        if (!title) continue
        let company = ''
        if (typeof obj.hiringOrganization === 'object') company = String(obj.hiringOrganization?.name ?? '').trim()
        const link = String(obj.url ?? obj.sameAs ?? '').trim()
        let location = ''
        if (typeof obj.jobLocation === 'object') {
          const addr = (obj.jobLocation as any).address
          location = typeof addr === 'object' ? String(addr?.addressLocality ?? addr?.addressRegion ?? '').trim() : String((obj.jobLocation as any).name ?? '').trim()
        }
        let salary = ''
        if (typeof obj.baseSalary === 'object') {
          const sal = obj.baseSalary as any
          if (typeof sal.value === 'object') {
            salary = sal.value.minValue && sal.value.maxValue ? `${sal.value.minValue}–${sal.value.maxValue} ${sal.currency ?? ''}`.trim() : String(sal.value.value ?? '')
          }
        }
        const postedAt = obj.datePosted ? new Date(obj.datePosted) : null
        const description = String(obj.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 400)
        results.push({ title: title.slice(0,200), company: company.slice(0,120), link: link.slice(0,600), location: location.slice(0,120), salary: salary.slice(0,120), description, postedAt })
      }
    } catch {}
  }
  return results
}

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|h\d|br|tr|td)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Types ─────────────────────────────────────────────────────────────

interface Job {
  title: string; company?: string; link?: string; location?: string
  salary?: string; description?: string; postedAt?: Date | null
}
interface Source { id: number; userId: string; label: string; url: string; keywords: string }

// ── Fetchers ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<Response | null> {
  const { timeoutMs = 12_000, ...rest } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal })
  } catch { return null }
  finally { clearTimeout(timer) }
}

async function fetchNaukri(url: string): Promise<Job[]> {
  const u = new URL(url)
  if (!/naukri\.com$/i.test(u.hostname)) return []
  const slug = u.pathname.replace(/^\/|\/$/g, '')
  const m = slug.match(/^(.+?)-jobs(?:-in-(.+))?$/)
  if (!m) return []
  const keyword = (m[1] ?? '').replace(/-/g, ' ')
  const location = (m[2] ?? '').replace(/-/g, ' ')
  const results: Job[] = []
  for (let page = 1; page <= 5; page++) {
    const apiUrl = new URL('https://www.naukri.com/jobapi/v3/search')
    apiUrl.searchParams.set('noOfResults', '100'); apiUrl.searchParams.set('urlType', 'search_by_keyword')
    apiUrl.searchParams.set('searchType', 'adv'); apiUrl.searchParams.set('keyword', keyword)
    if (location) apiUrl.searchParams.set('location', location); apiUrl.searchParams.set('pageNo', String(page))
    const res = await fetchWithTimeout(apiUrl.toString(), { headers: { appid: '109', systemid: '109', 'User-Agent': RSS_UA, Accept: 'application/json', Referer: 'https://www.naukri.com/', Origin: 'https://www.naukri.com' } })
    if (!res?.ok) break
    const data = (await res.json()) as any
    const jobs = data.jobDetails ?? []
    if (!jobs.length) break
    for (const j of jobs) {
      const ph = (label: string) => (j.placeholders ?? []).find((p: any) => p.label === label)?.title ?? ''
      results.push({
        title: String(j.title ?? '').trim().slice(0,200), company: String(j.companyName ?? '').trim().slice(0,120),
        link: String(j.jdURL ?? '').trim().slice(0,600), location: ph('location').slice(0,120),
        salary: ph('salary').slice(0,120), description: String(j.jobDescription ?? '').replace(/<[^>]+>/g, '').trim().slice(0,400),
        postedAt: j.createdDate ? new Date(Number(j.createdDate)) : null,
      })
    }
    if (jobs.length < 100) break
  }
  return results
}

async function fetchRss(url: string): Promise<Job[]> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': RSS_UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' } })
  if (!res?.ok) return []
  const xml = await res.text()
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return blocks.slice(0, 150).flatMap((item) => {
    const title = extractCdata(item, 'title'); if (!title) return []
    const link = extractCdata(item, 'link') || extractCdata(item, 'guid')
    const pubDate = extractCdata(item, 'pubDate')
    const descHtml = extractCdata(item, 'description')
    let company = ''
    const cm = descHtml.match(/company[^:]*:\s*<\/b>\s*([^<\n]+)/i) ?? descHtml.match(/<b>([^<]+)<\/b>\s*<br/i)
    if (cm?.[1]) company = cm[1].trim().slice(0, 120)
    const lm = descHtml.match(/location[^:]*:\s*<\/b>\s*([^<\n]+)/i)
    const location = lm?.[1] ? lm[1].trim().slice(0, 120) : ''
    const postedAt = pubDate ? new Date(pubDate) : null
    return [{ title: title.slice(0,200), company, link: link.slice(0,600), location, description: descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0,400), postedAt }]
  })
}

async function fetchRemotive(url: string): Promise<Job[]> {
  const u = new URL(url)
  const search = u.searchParams.get('search') || u.searchParams.get('q') || ''
  const params = new URLSearchParams({ limit: '100' }); if (search) params.set('search', search)
  const res = await fetchWithTimeout(`https://remotive.com/api/remote-jobs?${params}`, { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } })
  if (!res?.ok) return []
  const data = (await res.json()) as any
  return (data.jobs ?? []).slice(0, 100).map((j: any) => ({
    title: String(j.title ?? '').trim().slice(0,200), company: String(j.company_name ?? '').trim().slice(0,120),
    link: String(j.url ?? '').trim().slice(0,600), location: String(j.candidate_required_location ?? 'Remote').trim().slice(0,120),
    salary: String(j.salary ?? '').trim().slice(0,120),
    description: String(j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0,400),
    postedAt: j.publication_date ? new Date(j.publication_date) : null,
  }))
}

async function fetchRemoteOk(url: string): Promise<Job[]> {
  const u = new URL(url)
  let apiUrl = url
  if (!u.pathname.startsWith('/api')) {
    const m = u.pathname.match(/\/remote-(.+?)-jobs/)
    const tags = m?.[1] ? m[1].replace(/-/g, '+') : ''
    apiUrl = `https://remoteok.com/api${tags ? `?tags=${encodeURIComponent(tags)}` : ''}`
  }
  const res = await fetchWithTimeout(apiUrl, { headers: { 'User-Agent': RSS_UA, Accept: 'application/json' } })
  if (!res?.ok) return []
  const data = (await res.json()) as any[]
  return data.filter((j: any) => typeof j.position === 'string' && j.position.trim()).slice(0, 100).map((j: any) => ({
    title: (j.position ?? '').trim().slice(0,200), company: (j.company ?? '').trim().slice(0,120),
    link: (j.url ?? '').trim().slice(0,600), location: (j.location ?? '').trim().slice(0,120),
    description: (j.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0,400),
    salary: j.salary_min && j.salary_max ? `$${Math.round(j.salary_min/1000)}k–$${Math.round(j.salary_max/1000)}k` : '',
    postedAt: j.date ? new Date(j.date) : null,
  }))
}

type AtsType = 'lever' | 'greenhouse' | 'ashby' | 'smartrecruiters' | 'breezy' | 'workable'
function detectAts(url: string): { type: AtsType; company: string } | null {
  try {
    const u = new URL(url); const host = u.hostname.toLowerCase()
    const seg = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] ?? ''
    if (host === 'jobs.lever.co') return seg ? { type: 'lever', company: seg } : null
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') return seg ? { type: 'greenhouse', company: seg } : null
    if (host === 'jobs.ashbyhq.com') return seg ? { type: 'ashby', company: seg } : null
    if (host === 'careers.smartrecruiters.com') return seg ? { type: 'smartrecruiters', company: seg } : null
    if (host.endsWith('.breezy.hr')) return { type: 'breezy', company: host.replace(/\.breezy\.hr$/, '') }
    if (host === 'apply.workable.com' || host === 'jobs.workable.com') return seg ? { type: 'workable', company: seg } : null
  } catch {}
  return null
}

async function fetchAts(ats: { type: AtsType; company: string }): Promise<Job[]> {
  const c = encodeURIComponent(ats.company)
  const h = { 'User-Agent': RSS_UA, Accept: 'application/json' }
  if (ats.type === 'lever') {
    const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${c}?mode=json`, { headers: h })
    if (!res?.ok) return []
    const data = (await res.json()) as any[]
    return data.slice(0,100).map((j: any) => ({ title: String(j.text ?? '').trim().slice(0,200), company: ats.company, link: String(j.hostedUrl ?? '').trim().slice(0,600), location: String(j.categories?.location ?? '').trim().slice(0,120), salary: '', description: String(j.descriptionPlain ?? '').trim().slice(0,400), postedAt: j.createdAt ? new Date(j.createdAt) : null }))
  }
  if (ats.type === 'greenhouse') {
    const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs?content=true`, { headers: h })
    if (!res?.ok) return []
    const data = (await res.json()) as any
    return (data.jobs ?? []).slice(0,100).map((j: any) => ({ title: String(j.title ?? '').trim().slice(0,200), company: ats.company, link: String(j.absolute_url ?? '').trim().slice(0,600), location: String(j.offices?.[0]?.name ?? '').trim().slice(0,120), salary: '', description: String(j.content ?? '').replace(/<[^>]+>/g, '').trim().slice(0,400), postedAt: j.updated_at ? new Date(j.updated_at) : null }))
  }
  return []
}

async function fetchHtmlAndExtract(url: string): Promise<Job[]> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': RSS_UA, Accept: 'text/html,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.9' }, timeoutMs: 15_000 })
  if (!res?.ok) return []
  const raw = await res.text()
  // 1. Try JSON-LD first (free)
  const jsonLd = extractJsonLd(raw)
  if (jsonLd.length > 0) return jsonLd
  // 2. Fall back to AI if key is set
  if (!GROQ_KEY) return []
  const text = stripHtml(raw).slice(0, 8_000)
  for (const model of [GROQ_MODEL, 'llama-3.1-8b-instant', 'llama-3.2-1b-preview']) {
    try {
      const res2 = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model, temperature: 0.1, max_tokens: 2048,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Extract job listings from the page text. Return ONLY valid JSON: {"jobs":[{"title":"…","company":"…","link":"…","location":"…","salary":"…","description":"…"}]}. title is required. Keep ≤50 entries. If no jobs: {"jobs":[]}' },
            { role: 'user', content: `Page text:\n\n${text}` },
          ],
        }),
        timeoutMs: 30_000,
      })
      if (!res2) continue
      if (res2.status === 429) { await new Promise(r => setTimeout(r, 10_000)); continue }
      if (res2.status === 400) continue // decommissioned
      if (!res2.ok) continue
      const data = (await res2.json()) as any
      const txt = data.choices?.[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(txt)
      if (!Array.isArray(parsed.jobs)) return []
      return parsed.jobs.filter((j: any) => typeof j.title === 'string' && j.title.trim()).slice(0,50).map((j: any) => ({
        title: String(j.title).trim().slice(0,200), company: String(j.company ?? '').trim().slice(0,120),
        link: String(j.link ?? '').trim().slice(0,600), location: String(j.location ?? '').trim().slice(0,120),
        salary: String(j.salary ?? '').trim().slice(0,120), description: String(j.description ?? '').trim().slice(0,400), postedAt: null,
      }))
    } catch { continue }
  }
  return []
}

// ── Main ──────────────────────────────────────────────────────────────

async function pullSource(src: Source): Promise<{ added: number; status: string }> {
  const url = src.url
  let jobs: Job[] = []
  let method = 'unknown'

  try {
    if (/naukri\.com/i.test(url)) {
      method = 'naukri-api'; jobs = await fetchNaukri(url)
      if (jobs.length === 0) { method = 'html+jsonld+ai'; jobs = await fetchHtmlAndExtract(url) }
    } else if (/remotive\.com/i.test(url)) {
      method = 'remotive-api'; jobs = await fetchRemotive(url)
    } else if (/remoteok\.com/i.test(url)) {
      method = 'remoteok-api'; jobs = await fetchRemoteOk(url)
    } else if (/foundit\.in/i.test(url)) {
      method = 'html+jsonld+ai'; jobs = await fetchHtmlAndExtract(url)
    } else {
      const rssMatch = (() => {
        try { const u = new URL(url); return u.pathname.endsWith('/rss') || u.pathname.endsWith('/feed') || u.pathname.endsWith('.xml') || /indeed\.com\/rss/i.test(url) } catch { return false }
      })()
      if (rssMatch) {
        method = 'rss'; jobs = await fetchRss(url)
      } else {
        const ats = detectAts(url)
        if (ats) { method = `ats-${ats.type}`; jobs = await fetchAts(ats) }
        if (jobs.length === 0) { method = 'html+jsonld+ai'; jobs = await fetchHtmlAndExtract(url) }
      }
    }

    // Keyword filter: skip when the URL already encodes the role keyword,
    // or when the source is a known aggregator/ATS that returns all jobs
    // for a board (Greenhouse, Lever, Ashby, SmartRecruiters, etc.).
    const urlLower = (() => { try { return decodeURIComponent(url).toLowerCase() } catch { return url.toLowerCase() } })()
    const kws = src.keywords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
    const urlFiltered = kws.length > 0 && kws.some(kw =>
      urlLower.includes(kw) || urlLower.includes(kw.replace(/\s+/g, '-')) ||
      urlLower.includes(kw.replace(/\s+/g, '+')) || urlLower.includes(kw.replace(/\s+/g, '_'))
    )
    // ATS boards (Greenhouse/Lever/Ashby/SmartRecruiters/Workable/Breezy)
    // return ALL jobs for a company — skip keyword filter so we see every role,
    // then rely on the user's triage in the UI. Same for Remotive/RemoteOK/RSS
    // since those already filter by the ?tags= / ?search= query param.
    const isAtsDomain = /boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|careers\.smartrecruiters\.com|apply\.workable\.com|\.breezy\.hr/i.test(url)
    const skipKw = isAtsDomain ||
      /naukri\.com|remotive\.com|remoteok\.com|foundit\.in/i.test(url) ||
      /\/rss|\/feed|\.xml/i.test(new URL(url).pathname) || urlFiltered

    const nowMs = Date.now()
    let added = 0
    for (const j of jobs.slice(0, jobs.length)) {
      if (!skipKw && kws.length > 0) {
        const hay = `${j.title} ${j.company ?? ''}`.toLowerCase()
        if (!kws.some(kw => hay.includes(kw))) continue
      }
      const fp = fingerprint(j.title, j.company ?? '')
      try {
        // seen_at is NOT NULL with no SQL DEFAULT (only Drizzle $defaultFn).
        // Must supply it in raw SQL or the insert is silently rejected.
        await client.execute({
          sql: `INSERT INTO job_leads
                  (user_id, source_id, fingerprint, title, company, link, location,
                   salary, description, posted_at, status, seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
          args: [
            src.userId, src.id, fp,
            j.title, j.company ?? '', j.link ?? '', j.location ?? '',
            j.salary ?? '', j.description ?? '',
            j.postedAt ? j.postedAt.getTime() : null,
            nowMs,
          ],
        })
        added++
      } catch { /* unique-index violation = already seen */ }
    }

    const status = added > 0 ? `ok-${added}-new` : `ok-no-new(${jobs.length}raw)`
    await client.execute({
      sql: 'UPDATE job_sources SET last_status = ?, last_error = ?, last_fetched_at = ? WHERE id = ?',
      args: [status, '', jobs.length > 0 ? Date.now() : null, src.id],
    })
    return { added, status }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 240) : 'error'
    await client.execute({ sql: 'UPDATE job_sources SET last_status = ?, last_error = ?, last_fetched_at = ? WHERE id = ?', args: ['error', msg, Date.now(), src.id] })
    return { added: 0, status: `error: ${msg}` }
  }
}

async function main() {
  const rows = await client.execute('SELECT id, user_id, label, url, keywords FROM job_sources WHERE active = 1 ORDER BY id')
  const sources: Source[] = rows.rows.map(r => ({ id: Number(r[0]), userId: String(r[1]), label: String(r[2]), url: String(r[3]), keywords: String(r[4] ?? '') }))
  console.log(`Pulling ${sources.length} active sources...\n`)

  let totalAdded = 0
  for (const src of sources) {
    process.stdout.write(`[${src.id}] ${src.label.slice(0, 40).padEnd(40)} `)
    const r = await pullSource(src)
    totalAdded += r.added
    console.log(r.status)
  }

  const final = await client.execute('SELECT COUNT(*) FROM job_leads')
  console.log(`\nDone. Total leads in DB: ${final.rows[0]?.[0] ?? '?'}  (+${totalAdded} this run)`)
}

main().catch(e => { console.error(e); process.exit(1) })
