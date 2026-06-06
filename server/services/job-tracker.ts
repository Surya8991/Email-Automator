import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { jobSources, jobLeads, type JobSource, type JobLead } from '@/server/db/schema'
import { fetchForAi } from './ai-generate'
import { notify } from './notify'
import { findAdapter } from './job-adapters/registry'
import { extractJsonLd } from './job-adapters/json-ld'
import { aiExtractJobs } from './job-adapters/ai'
import { fetchNaukriApi } from './job-adapters/naukri'
import { atsSubtype } from './job-adapters/ats'
import type { RawJob } from './job-adapters/types'
import { normalizeSalary, normalizeLocation, crossKey, isAggregator } from './normalize'
import { sanitiseLink, stripHtml } from './job-adapters/utils'

// ── Job tracker service ─────────────────────────────────────────────
// Per-source fetchers live in ./job-adapters/*.ts; this file holds the
// orchestration (tickSource / tickAll), DB CRUD, dedup, and pruning.

const MAX_NEW_PER_TICK = 50            // ongoing non-Naukri cap per tick
const FETCH_INTERVAL_MS = 12 * 60 * 60 * 1_000 // 12 hours

// ── Sources: CRUD ────────────────────────────────────────────────────

export async function listSources(userId: string): Promise<JobSource[]> {
  return db.select().from(jobSources).where(eq(jobSources.userId, userId)).orderBy(desc(jobSources.id))
}

export async function leadCountsBySource(userId: string): Promise<Map<number, number>> {
  const rows = await db.select({
    sourceId: jobLeads.sourceId,
    n: sql<number>`COUNT(*)`,
  }).from(jobLeads).where(eq(jobLeads.userId, userId)).groupBy(jobLeads.sourceId)
  return new Map(rows.map((r) => [r.sourceId, Number(r.n)]))
}

export async function setSourceActive(userId: string, id: number, active: boolean): Promise<void> {
  await db.update(jobSources).set({ active })
    .where(and(eq(jobSources.id, id), eq(jobSources.userId, userId)))
}

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

// ── Leads: CRUD ──────────────────────────────────────────────────────

export async function bulkSetLeadStatus(
  userId: string, ids: number[], status: 'new' | 'saved' | 'ignored' | 'applied',
): Promise<{ updated: number }> {
  if (!ids || ids.length === 0) return { updated: 0 }
  if (ids.length > 500) ids = ids.slice(0, 500)
  await db.update(jobLeads).set({ status })
    .where(and(inArray(jobLeads.id, ids), eq(jobLeads.userId, userId)))
  return { updated: ids.length }
}

export async function listLeads(userId: string, status: string = 'new', limit = 3000): Promise<JobLead[]> {
  return db.select().from(jobLeads)
    .where(and(eq(jobLeads.userId, userId), eq(jobLeads.status, status)))
    .orderBy(desc(jobLeads.seenAt)).limit(limit)
}

export async function setLeadStatus(
  userId: string, id: number, status: 'new' | 'saved' | 'ignored' | 'applied',
): Promise<void> {
  await db.update(jobLeads).set({ status })
    .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, userId)))
}

// ── Dedup + keyword filtering ────────────────────────────────────────

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

/** Detect when the source URL already encodes the keyword filter (e.g.
 *  Naukri /seo-jobs-in-bangalore). When true the post-fetch keyword
 *  filter is skipped — relevant broadly-titled jobs would otherwise be
 *  dropped. */
function urlAlreadyFiltered(url: string, keywords: string): boolean {
  if (!keywords.trim()) return false
  try {
    const urlDecoded = decodeURIComponent(url).toLowerCase()
    return keywords
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
}

// ── Orchestration ────────────────────────────────────────────────────

/**
 * Run one tick for a single source. Returns the count of new leads
 * stored. Wraps every step in try/catch so partial failures still
 * record `lastStatus` / `lastError` on the source for visibility.
 */
export async function tickSource(source: JobSource): Promise<{ added: number; skipped: number; status: string; error?: string }> {
  const isFirstFetch = !source.lastFetchedAt
  const adapter = findAdapter(source.url)
  const skipKwFilter = (adapter?.skipKeywordFilter ?? false) || urlAlreadyFiltered(source.url, source.keywords)

  try {
    let jobs: RawJob[] = []

    // 1. Dedicated adapter (Naukri / Foundit / RSS / RemoteOK / Remotive / ATS)
    if (adapter) {
      jobs = await adapter.fetch(source, { isFirstFetch })
    }

    // 2 + 3. Fallback path — runs when no dedicated adapter matched OR
    //         the matched adapter returned 0 (e.g. Naukri API blocked).
    //         RSS / RemoteOK / Remotive don't fall through (their APIs
    //         legitimately return 0 when no listings match).
    // Adapters that use their own structured API — don't fall back to HTML/AI
    // when they return 0 (their API legitimately returns 0, or is blocked).
    // Naukri/Foundit have dedicated APIs; falling through causes the AI
    // extractor to be called against the SPA homepage (waste + error).
    const isRssLike = adapter?.name === 'rss'
      || adapter?.name === 'remote-ok'
      || adapter?.name === 'remotive'
      || adapter?.name === 'naukri'
      || adapter?.name === 'foundit'
      || adapter?.name === 'internshala'
    if (jobs.length === 0 && !isRssLike) {
      const fetched = await fetchForAi(source.url)
      if (!fetched.ok) {
        await db.update(jobSources).set({
          lastFetchedAt: Date.now(), lastStatus: 'fetch-failed', lastError: fetched.error.slice(0, 240),
        }).where(eq(jobSources.id, source.id))
        return { added: 0, skipped: 0, status: 'fetch-failed', error: fetched.error }
      }
      // 2. JSON-LD schema.org/JobPosting — covers LinkedIn, Glassdoor,
      //    company career pages embedding Google Jobs markup.
      jobs = extractJsonLd(fetched.rawHtml, source.url)
      // 3. AI — last resort when no structured data found.
      if (jobs.length === 0) {
        jobs = await aiExtractJobs(source.userId, fetched.text, source.url)
      }
    }

    // First fetch: take everything extracted. Ongoing: cap per tick.
    const batchCap = isFirstFetch ? jobs.length : MAX_NEW_PER_TICK
    const currentAdapterName = adapter?.name ?? ''
    const currentIsAggregator = isAggregator(currentAdapterName)
    let added = 0, skipped = 0
    // Only ingest leads posted within 15 days — older listings are stale.
    const FIFTEEN_DAYS_AGO = Date.now() - 15 * 24 * 60 * 60 * 1_000
    for (const j of jobs.slice(0, batchCap)) {
      if (!skipKwFilter && !keywordsMatch(j.title, j.company ?? '', source.keywords)) continue
      // Skip jobs posted more than 15 days ago — stale and unlikely to be accepting.
      if (j.postedAt && j.postedAt.getTime() < FIFTEEN_DAYS_AGO) { skipped++; continue }
      const fp = fingerprintOf(j.title, j.company ?? '')
      // Sanitise the link once — strips tracking params, rejects same-as-source
      // and non-http URLs, resolves relative URLs against the source URL.
      // Adapters that already call sanitiseLink() are safely idempotent here.
      const cleanLink = sanitiseLink(j.link ?? '', source.url)
      // Normalize once per row so we can populate the canonical columns +
      // run the cross-board dedup pass before the per-source insert.
      const sal = normalizeSalary(j.salary ?? '')
      const loc = normalizeLocation(j.location ?? '')
      const ck  = crossKey(j.company ?? '', j.title, loc.norm)
      // Decode HTML entities + strip tags so descriptions render as plain text.
      const cleanDesc = stripHtml(j.description ?? '')

      // Cross-board dedup: when the same (company,title,location) already
      // exists from another source, decide whether to upgrade or skip.
      //   - existing aggregator + new canonical → hand the row over.
      //   - everything else → keep existing, skip insert.
      if (ck) {
        const existing = await db.select({ id: jobLeads.id, sourceId: jobLeads.sourceId })
          .from(jobLeads)
          .where(and(eq(jobLeads.userId, source.userId), eq(jobLeads.crossKey, ck)))
          .limit(1)
        if (existing[0] && existing[0].sourceId !== source.id) {
          const [existingSrc] = await db.select({ url: jobSources.url })
            .from(jobSources).where(eq(jobSources.id, existing[0].sourceId))
          const existingAdapterName = existingSrc ? findAdapter(existingSrc.url)?.name ?? '' : ''
          if (isAggregator(existingAdapterName) && !currentIsAggregator) {
            // Canonical upgrade: rewrite the existing row to point at this
            // (better) source. Fill empties; never overwrite a richer value.
            await db.update(jobLeads).set({
              sourceId: source.id,
              link:     sql`CASE WHEN link = '' THEN ${cleanLink} ELSE link END`,
              salary:   sql`CASE WHEN salary = '' THEN ${j.salary ?? ''} ELSE salary END`,
              location: sql`CASE WHEN location = '' THEN ${j.location ?? ''} ELSE location END`,
              description: sql`CASE WHEN length(description) < length(${cleanDesc}) THEN ${cleanDesc} ELSE description END`,
              salaryMin:    sql`CASE WHEN salary_min IS NULL THEN ${sal.min} ELSE salary_min END`,
              salaryMax:    sql`CASE WHEN salary_max IS NULL THEN ${sal.max} ELSE salary_max END`,
              salaryCcy:    sql`CASE WHEN salary_ccy = '' THEN ${sal.ccy} ELSE salary_ccy END`,
              salaryPeriod: sql`CASE WHEN salary_period = '' THEN ${sal.period} ELSE salary_period END`,
              locationNorm: sql`CASE WHEN location_norm = '' THEN ${loc.norm} ELSE location_norm END`,
              remoteScope:  sql`CASE WHEN remote_scope = '' THEN ${loc.remoteScope} ELSE remote_scope END`,
            }).where(eq(jobLeads.id, existing[0].id))
          }
          // Either way: the row already exists for this user. Skip insert.
          continue
        }
      }
      try {
        await db.insert(jobLeads).values({
          userId: source.userId, sourceId: source.id,
          fingerprint: fp,
          title: j.title,
          company: j.company ?? '',
          link: cleanLink,
          location: j.location ?? '',
          salary: j.salary ?? '',
          description: cleanDesc,
          postedAt: j.postedAt ?? null,
          salaryMin: sal.min, salaryMax: sal.max,
          salaryCcy: sal.ccy, salaryPeriod: sal.period,
          locationNorm: loc.norm, remoteScope: loc.remoteScope,
          crossKey: ck,
        })
        added++
      } catch {
        // Unique-index violation = already seen on THIS source. Enrich
        // empty/shorter fields when the re-fetch has better data.
        const newSalary = j.salary ?? ''
        const newLoc = j.location ?? ''
        const newDesc = cleanDesc
        await db.update(jobLeads).set({
          link:     sql`CASE WHEN link = '' THEN ${cleanLink} ELSE link END`,
          salary:   sql`CASE WHEN salary = '' THEN ${newSalary} ELSE salary END`,
          location: sql`CASE WHEN location = '' THEN ${newLoc} ELSE location END`,
          description: sql`CASE WHEN length(description) < length(${newDesc}) THEN ${newDesc} ELSE description END`,
          // Backfill normalized columns on re-fetch when the row was
          // inserted pre-0012 (or saw an empty value the first time).
          salaryMin:    sql`CASE WHEN salary_min IS NULL THEN ${sal.min} ELSE salary_min END`,
          salaryMax:    sql`CASE WHEN salary_max IS NULL THEN ${sal.max} ELSE salary_max END`,
          salaryCcy:    sql`CASE WHEN salary_ccy = '' THEN ${sal.ccy} ELSE salary_ccy END`,
          salaryPeriod: sql`CASE WHEN salary_period = '' THEN ${sal.period} ELSE salary_period END`,
          locationNorm: sql`CASE WHEN location_norm = '' THEN ${loc.norm} ELSE location_norm END`,
          remoteScope:  sql`CASE WHEN remote_scope = '' THEN ${loc.remoteScope} ELSE remote_scope END`,
          crossKey:     sql`CASE WHEN cross_key = '' THEN ${ck} ELSE cross_key END`,
        }).where(and(eq(jobLeads.sourceId, source.id), eq(jobLeads.fingerprint, fp)))
      }
    }
    // Only stamp lastFetchedAt when the source returned raw jobs.
    // Otherwise keep treating this as first-fetch on the next tick.
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
    return { added, skipped, status: 'ok' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'tick failed'
    await db.update(jobSources).set({
      lastFetchedAt: Date.now(), lastStatus: 'error', lastError: msg.slice(0, 240),
    }).where(eq(jobSources.id, source.id))
    return { added: 0, skipped: 0, status: 'error', error: msg }
  }
}

/** Delete new/ignored leads older than 15 days. Called by tickAll on every
 *  cron tick. Saved + applied leads are kept forever. Matches the 15-day
 *  ingest filter so no stale leads accumulate in the new/ignored piles. */
export async function pruneOldLeads(): Promise<number> {
  const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
  const result = await db.delete(jobLeads)
    .where(and(
      inArray(jobLeads.status, ['new', 'ignored']),
      lt(jobLeads.seenAt, cutoff),
    ))
  return (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
}

export async function tickAll(limit = 40): Promise<{ scanned: number; addedTotal: number; errors: number; pruned: number }> {
  const cutoff = Date.now() - FETCH_INTERVAL_MS
  // Oldest-fetched first (NULL = never-fetched wins) so a noisy tenant
  // can't starve smaller tenants inside the 40-source cron budget.
  const sources = await db.select().from(jobSources)
    .where(and(
      eq(jobSources.active, true),
      or(isNull(jobSources.lastFetchedAt), lt(jobSources.lastFetchedAt, cutoff)),
    ))
    .orderBy(sql`${jobSources.lastFetchedAt} IS NOT NULL, ${jobSources.lastFetchedAt} ASC`)
    .limit(limit)
  let addedTotal = 0, errors = 0
  for (const s of sources) {
    try {
      const r = await tickSource(s)
      addedTotal += r.added
      if (r.status === 'error') errors++
    } catch (e) {
      errors++
      console.error(`[tickAll] uncaught from source ${s.id}:`, e)
    }
  }
  const pruned = await pruneOldLeads().catch(() => 0)
  return { scanned: sources.length, addedTotal, errors, pruned }
}

export async function tickSourceById(userId: string, sourceId: number): Promise<{ added: number; status: string; error?: string }> {
  const [s] = await db.select().from(jobSources)
    .where(and(eq(jobSources.id, sourceId), eq(jobSources.userId, userId)))
  if (!s) return { added: 0, status: 'not-found' }
  return tickSource(s)
}

/** Reset lastFetchedAt to null on all active sources for a user so the
 *  next tickSource treats them as first-fetch. Used by Full refresh. */
export async function resetSourceTimestamps(userId: string): Promise<number> {
  const result = await db.update(jobSources)
    .set({ lastFetchedAt: null })
    .where(and(eq(jobSources.userId, userId), eq(jobSources.active, true)))
  return (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
}

/** Returns the adapter name that would match this URL, or '' if the URL
 *  would fall through to JSON-LD / AI. Used by validateJobSourceAction
 *  to label the test panel ("✓ Matched Workday adapter — 3 sample jobs"). */
export function adapterFor(url: string): string {
  const a = findAdapter(url)
  if (!a) return ''
  if (a.name === 'ats') return atsSubtype(url) ?? 'ats'
  return a.name
}

// ── Backwards-compat exports for callers in server/actions/job-tracker.ts ──
export { fingerprintOf, keywordsMatch }
export { aiExtractJobs as aiExtractJobsPublic }
export { fetchNaukriApi as fetchNaukriApiPublic }
