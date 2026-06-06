'use server'
import { z } from 'zod'
import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { jobLeads, jobSources, contacts as contactsTbl, drafts as draftsTbl } from '@/server/db/schema'
import * as svc from '@/server/services/job-tracker'
import { validateUrlForFetch, fetchForAi } from '@/server/services/ai-generate'
import { aiExtractJobsPublic, fetchNaukriApiPublic } from '@/server/services/job-tracker'
import { actionError } from '@/lib/action-error'
import { rateLimit } from '@/lib/rate-limit'

const AddSchema = z.object({
  label: z.string().max(120).optional(),
  url: z.string().min(8).max(500),
  keywords: z.string().max(400).optional(),
})

export async function addJobSourceAction(input: z.infer<typeof AddSchema>) {
  const u = await requireUser()
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`job-add:${u.id}`, 10, 60_000)) return { error: 'Slow down — try again in a minute' }
  // Validate URL shape + SSRF surface WITHOUT actually fetching. The
  // earlier version called fetchForAi here, which rejected sources
  // that returned 403/404 to our default UA at add time (real-world
  // example: Built In, MarTech Jobs, several India boards that block
  // generic bots). Those URLs are still valid — the cron tick uses a
  // fresh request and records any HTTP error on the source row, so
  // the user can iterate on the URL after adding.
  const sanity = validateUrlForFetch(parsed.data.url)
  if (!sanity.ok) {
    return { error: `URL rejected: ${sanity.error}` }
  }
  try {
    const source = await svc.createSource(u.id, parsed.data.label || parsed.data.url, parsed.data.url, parsed.data.keywords ?? '')
    // Immediately fetch the new source so the user sees jobs right away
    // instead of waiting for the next cron tick (up to 12 h away).
    // We await so the UI can show "X jobs found" in the success toast.
    const tick = await svc.tickSource(source).catch(() => ({ added: 0, status: 'error' }))
    revalidatePath('/jobs')
    return { ok: true as const, added: tick.added }
  } catch (e) {
    return actionError(e, 'Add failed')
  }
}

export async function deleteJobSourceAction(id: number) {
  const u = await requireUser()
  await svc.deleteSource(u.id, id)
  revalidatePath('/jobs')
  return { ok: true as const }
}

export async function deleteAllJobSourcesAction() {
  const u = await requireUser()
  if (!rateLimit(`delete-all-sources:${u.id}`, 3, 60_000)) return { error: 'Slow down — try again in a minute' }
  const r = await svc.deleteAllSources(u.id)
  revalidatePath('/jobs')
  return { ok: true as const, deleted: r.deleted }
}

export async function bulkDeleteJobSourcesAction(ids: number[]) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No sources selected' }
  if (ids.length > 100) return { error: 'Pick at most 100 sources at a time' }
  if (!rateLimit(`source-bulk-delete:${u.id}`, 5, 60_000)) return { error: 'Slow down' }
  const r = await svc.bulkDeleteSources(u.id, ids)
  revalidatePath('/jobs')
  return { ok: true as const, deleted: r.deleted }
}

export async function bulkToggleSourceActiveAction(ids: number[], active: boolean) {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No sources selected' }
  if (ids.length > 100) return { error: 'Pick at most 100 at a time' }
  if (!rateLimit(`source-bulk-toggle:${u.id}`, 10, 60_000)) return { error: 'Slow down' }
  await svc.bulkSetSourceActive(u.id, ids, active)
  revalidatePath('/jobs')
  return { ok: true as const }
}

export async function refreshJobSourceAction(id: number) {
  const u = await requireUser()
  // Manual refresh is heavier than cron — rate-limit 6/min/user.
  if (!rateLimit(`job-refresh:${u.id}`, 6, 60_000)) return { error: 'Too many refreshes — wait a minute' }
  try {
    const r = await svc.tickSourceById(u.id, id)
    revalidatePath('/jobs')
    return { ok: true as const, ...r }
  } catch (e) {
    return actionError(e, 'Refresh failed')
  }
}

export async function setJobLeadStatusAction(id: number, status: 'new' | 'saved' | 'ignored' | 'applied') {
  const u = await requireUser()
  await svc.setLeadStatus(u.id, id, status)
  revalidatePath('/jobs')
  return { ok: true as const }
}

/**
 * Bulk status change on a checkbox-selected set of lead ids. Cap at
 * 500 ids per call to keep the loop bounded.
 */
export async function bulkSetJobLeadStatusAction(ids: number[], status: 'new' | 'saved' | 'ignored' | 'applied') {
  const u = await requireUser()
  if (!ids || ids.length === 0) return { error: 'No leads selected' }
  if (ids.length > 500) return { error: 'Pick at most 500 leads at a time' }
  if (!rateLimit(`lead-bulk:${u.id}`, 6, 60_000)) return { error: 'Too many bulk actions — slow down' }
  const r = await svc.bulkSetLeadStatus(u.id, ids, status)
  revalidatePath('/jobs')
  return { ok: true as const, ...r }
}

/**
 * Permanently delete a lead. Hard delete (matches pruneOldLeads semantics).
 * `Ignore` keeps the row for analytics; this removes it.
 *
 * Drafts and contacts created from this lead via leadToDraftAction are NOT
 * affected — they live in their own tables and are managed separately.
 */
export async function deleteJobLeadAction(id: number) {
  const u = await requireUser()
  if (!rateLimit(`lead-delete:${u.id}`, 60, 60_000)) return { error: 'Slow down' }
  await db.delete(jobLeads)
    .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, u.id)))
  revalidatePath('/jobs')
  return { ok: true as const }
}

/**
 * Bulk hard-delete leads. Cap of 500 per call mirrors bulkSetJobLeadStatusAction.
 */
export async function bulkDeleteJobLeadsAction(ids: number[]) {
  const u = await requireUser()
  if (!ids?.length) return { error: 'No leads selected' }
  if (ids.length > 500) return { error: 'Pick at most 500 leads at a time' }
  if (!rateLimit(`lead-bulk-delete:${u.id}`, 6, 60_000)) return { error: 'Too many bulk deletes — slow down' }
  const result = await db.delete(jobLeads)
    .where(and(inArray(jobLeads.id, ids), eq(jobLeads.userId, u.id)))
  const deleted = (result as unknown as { rowsAffected?: number }).rowsAffected ?? ids.length
  revalidatePath('/jobs')
  return { ok: true as const, deleted }
}

/** Pause / resume a source. Paused = skipped by the cron tickAll. */
export async function toggleJobSourceActiveAction(id: number, active: boolean) {
  const u = await requireUser()
  await svc.setSourceActive(u.id, id, active)
  revalidatePath('/jobs')
  return { ok: true as const }
}

const EditSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  url: z.string().min(8).max(500).optional(),
  keywords: z.string().max(400).optional(),
})

/**
 * Edit a source in place. If the URL changes, we re-run the SSRF
 * validator before saving so the new URL has the same guard.
 */
export async function editJobSourceAction(id: number, input: z.infer<typeof EditSchema>) {
  const u = await requireUser()
  const parsed = EditSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`source-edit:${u.id}`, 20, 60_000)) return { error: 'Slow down' }
  if (parsed.data.url) {
    // Same lighter validator as addJobSourceAction — shape + SSRF only.
    const sanity = validateUrlForFetch(parsed.data.url)
    if (!sanity.ok) return { error: `URL rejected: ${sanity.error}` }
  }
  try {
    await svc.updateSource(u.id, id, parsed.data)
    revalidatePath('/jobs')
    return { ok: true as const }
  } catch (e) {
    return actionError(e, 'Edit failed')
  }
}

/**
 * Manual "refresh all" — runs tickAll for THIS user only (not every
 * tenant on the instance). Useful when iterating on keywords without
 * waiting an hour for the cron. Bounded by the per-source MAX_NEW_PER_TICK
 * inside the service.
 */
export async function refreshAllForUserAction() {
  const u = await requireUser()
  if (!rateLimit(`refresh-all:${u.id}`, 3, 60_000)) return { error: 'Too many full refreshes — wait a minute' }
  try {
    const sources = await svc.listSources(u.id)
    let addedTotal = 0, scanned = 0, errors = 0
    for (const s of sources) {
      if (!s.active) continue
      try {
        const r = await svc.tickSource(s)
        addedTotal += r.added
        if (r.status === 'error') errors++
      } catch (e) {
        errors++
        console.error(`[refreshAllForUserAction] source ${s.id} threw:`, e)
      }
      scanned++
    }
    revalidatePath('/jobs')
    return { ok: true as const, scanned, addedTotal, errors }
  } catch (e) {
    return actionError(e, 'Refresh-all failed')
  }
}

/**
 * Full refresh: resets all source timestamps to force first-fetch page
 * budget (500 Naukri results instead of 100), then re-fetches every active
 * source. Existing leads get their description/salary/link enriched with
 * the fuller data; new leads are inserted as usual.
 */
export async function fullRefreshAllAction() {
  const u = await requireUser()
  if (!rateLimit(`full-refresh:${u.id}`, 1, 5 * 60_000)) return { error: 'Full refresh is rate-limited to once every 5 minutes' }
  try {
    await svc.resetSourceTimestamps(u.id)
    const sources = await svc.listSources(u.id)
    let addedTotal = 0, enriched = 0, scanned = 0, errors = 0
    for (const s of sources) {
      if (!s.active) continue
      try {
        const r = await svc.tickSource(s)
        addedTotal += r.added
        if (r.status === 'error') errors++
      } catch (e) {
        errors++
        console.error(`[fullRefreshAllAction] source ${s.id} threw:`, e)
      }
      scanned++
    }
    revalidatePath('/jobs')
    return { ok: true as const, scanned, addedTotal, enriched, errors }
  } catch (e) {
    return actionError(e, 'Full refresh failed')
  }
}

/**
 * Convert a job lead into a contact + draft outreach. The user gets
 * a pre-filled draft they can edit and send, plus the company recorded
 * as a contact so future analytics aggregate correctly.
 *
 * We DON'T have an email address for the lead — the contact is added
 * with an empty email, and the draft is created in the user's editor
 * (they fill in the email separately). This unblocks the workflow
 * without faking an address.
 */
export async function leadToDraftAction(id: number) {
  const u = await requireUser()
  if (!rateLimit(`lead-draft:${u.id}`, 30, 60_000)) return { error: 'Slow down' }
  const [lead] = await db.select().from(jobLeads)
    .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, u.id)))
  if (!lead) return { error: 'Lead not found' }
  try {
    // Dedup guard: if a contact already exists for this listing — either
    // by URL (preferred) or by (jobTitle, company) when there's no link —
    // skip the insert so we don't accumulate identical job-tracker contacts.
    const dedupCond = lead.link
      ? and(eq(contactsTbl.userId, u.id), eq(contactsTbl.sourceUrl, lead.link))
      : and(
          eq(contactsTbl.userId, u.id),
          eq(contactsTbl.platform, 'jobs-tracker'),
          eq(contactsTbl.jobTitle, lead.title),
          eq(contactsTbl.company, lead.company || ''),
        )
    const [dup] = await db.select({ id: contactsTbl.id }).from(contactsTbl)
      .where(dedupCond).limit(1)
    if (dup) return { error: 'An outreach draft already exists for this listing.' }
    // Insert a placeholder contact for analytics / dedupe. Empty email
    // is intentional — the user fills it in on the contact detail.
    const inserted = await db.insert(contactsTbl).values({
      userId: u.id,
      recruiterName: lead.company || 'Recruiter',
      company: lead.company || '',
      jobTitle: lead.title,
      location: lead.location || '',
      sourceUrl: lead.link || '',
      platform: 'jobs-tracker',
      recruiterEmail: '',
      emailStatus: 'Draft Created',
    }).returning({ id: contactsTbl.id })
    const contactId = inserted[0]!.id
    const subject = `Application: ${lead.title}${lead.company ? ` at ${lead.company}` : ''}`
    // Build a richer outreach email using whatever fields the lead has.
    // All AI-extracted values are HTML-escaped to prevent stored XSS.
    const safeLink = /^https?:\/\//i.test(lead.link ?? '') ? lead.link : ''
    const metaLines: string[] = []
    if (lead.company)  metaLines.push(`<strong>Company:</strong> ${escHtml(lead.company)}`)
    if (lead.location) metaLines.push(`<strong>Location:</strong> ${escHtml(lead.location)}`)
    if (lead.salary)   metaLines.push(`<strong>Salary:</strong> ${escHtml(lead.salary)}`)
    if (safeLink)      metaLines.push(`<strong>Listing:</strong> <a href="${escHtml(safeLink)}">${escHtml(safeLink)}</a>`)
    const descSnippet = lead.description
      ? `<blockquote style="border-left:3px solid #ccc;padding-left:1em;margin:0.5em 0;color:#555;font-size:0.9em">${escHtml(lead.description.slice(0, 300))}${lead.description.length > 300 ? '…' : ''}</blockquote>`
      : ''
    const metaBlock = metaLines.length
      ? `<p style="font-size:0.85em;color:#666">${metaLines.join(' &nbsp;·&nbsp; ')}</p>`
      : ''
    const body =
      `<p>Hi {{name}},</p>` +
      `<p>I came across the <strong>${escHtml(lead.title)}</strong>${lead.company ? ` position at <strong>${escHtml(lead.company)}</strong>` : ' role'}` +
      `${lead.location ? ` in ${escHtml(lead.location)}` : ''} and I'm very interested in applying.</p>` +
      `${descSnippet}` +
      `${metaBlock}` +
      `<p>I'd love to learn more about the role and share how my background aligns with what you're looking for. Would you be open to a quick chat?</p>` +
      `<p>Best regards,<br/>{{your_name}}</p>`
    await db.insert(draftsTbl).values({
      userId: u.id, contactId,
      toEmail: '', subject, htmlBody: body, plainBody: body.replace(/<[^>]+>/g, ''),
    })
    // Mark the lead as applied so it leaves the New tray.
    await svc.setLeadStatus(u.id, id, 'applied')
    revalidatePath('/jobs')
    revalidatePath('/contacts')
    revalidatePath('/drafts')
    return { ok: true as const, contactId }
  } catch (e) {
    return actionError(e, 'Convert failed')
  }
}

/**
 * Validate a source URL before saving — does a real test fetch and
 * returns 1-3 sample jobs so the user can confirm the board is reachable
 * and the AI extractor picks up real listings.
 *
 * Does NOT save anything to the DB. Rate-limited to 5/min/user.
 */
// ── Dead-link detection helpers ──────────────────────────────────────────────
// Shared by checkDeadLinksAction (monolithic) and checkLinksBatchAction
// (per-batch, used by the client progress orchestration).
const DEAD_STATUS  = new Set([404, 410, 400])
const DEAD_PATTERN = /(\/404|not.found|job.not.available|position.closed|listing.expired|no.longer.available|job.filled|job.closed)/i
const CHECK_UA     = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

async function isDead(url: string): Promise<boolean> {
  // SSRF guard: reject private IPs, localhost, and non-http(s) schemes.
  if (!validateUrlForFetch(url).ok) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6_000)
  try {
    const r = await fetch(url, {
      method: 'HEAD', signal: ctrl.signal,
      headers: { 'User-Agent': CHECK_UA },
      // manual = do not follow redirects to potentially-internal IPs
      redirect: 'manual',
    }).catch(() => null)
    if (!r) return false
    // 3xx with manual redirect = assume alive (we can't safely follow further)
    if (r.status >= 300 && r.status < 400) return false
    if (DEAD_STATUS.has(r.status)) return true
    if (DEAD_PATTERN.test(r.url)) return true
    return false
  } catch { return false }
  finally { clearTimeout(timer) }
}

/**
 * Check all active (new/saved) leads' links for 404s and auto-ignore dead ones.
 * Processes in batches of 20 with a 6 s timeout per request.
 */
export async function checkDeadLinksAction() {
  const u = await requireUser()
  if (!rateLimit(`dead-links:${u.id}`, 1, 2 * 60_000)) return { error: 'Already running — wait 2 minutes' }

  const leads = await db.select({ id: jobLeads.id, link: jobLeads.link })
    .from(jobLeads)
    .where(and(
      eq(jobLeads.userId, u.id),
      inArray(jobLeads.status, ['new', 'saved']),
      ne(jobLeads.link, ''),
    ))

  if (leads.length === 0) return { ok: true as const, dead: 0, checked: 0 }

  const deadIds: number[] = []
  const BATCH = 20
  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (l) => {
      const dead = await isDead(l.link)
      return dead ? l.id : null
    }))
    deadIds.push(...results.filter((x): x is number => x !== null))
  }

  if (deadIds.length > 0) {
    await db.update(jobLeads)
      .set({ status: 'ignored' })
      .where(and(eq(jobLeads.userId, u.id), inArray(jobLeads.id, deadIds)))
  }

  revalidatePath('/jobs')
  return { ok: true as const, dead: deadIds.length, checked: leads.length }
}

/**
 * Delete new/ignored leads older than `days` days (7 / 14 / 30 / 60).
 * Only affects new + ignored — saved and applied leads are never auto-pruned.
 * Rate-limited to 3 calls/min to prevent accidental rapid-fire.
 */
export async function pruneLeadsByAgeAction(days: number) {
  const u = await requireUser()
  if (!rateLimit(`prune-age:${u.id}`, 3, 60_000)) return { error: 'Slow down — try again in a minute' }
  const validDays = [7, 14, 30, 60]
  if (!validDays.includes(days)) return { error: 'Invalid age — pick 7, 14, 30, or 60 days' }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1_000)
  const result = await db.delete(jobLeads)
    .where(and(
      eq(jobLeads.userId, u.id),
      inArray(jobLeads.status, ['new', 'ignored']),
      lt(jobLeads.seenAt, cutoff),
    ))
  const deleted = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0
  revalidatePath('/jobs')
  return { ok: true as const, deleted }
}

/**
 * Count new/ignored leads older than `days` days — used to show preview
 * before the user confirms deletion ("This will delete ~N leads").
 */
export async function countLeadsByAgeAction(days: number) {
  const u = await requireUser()
  const validDays = [7, 14, 30, 60]
  if (!validDays.includes(days)) return { count: 0 }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1_000)
  const result = await db.select({ n: sql<number>`COUNT(*)` })
    .from(jobLeads)
    .where(and(
      eq(jobLeads.userId, u.id),
      inArray(jobLeads.status, ['new', 'ignored']),
      lt(jobLeads.seenAt, cutoff),
    ))
  return { count: Number(result[0]?.n ?? 0) }
}

// Inline HTML escaper for AI-extracted job fields used in email templates.
// Prevents stored XSS when the draft htmlBody is later rendered in a browser.
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Per-step actions used by client-side progress orchestration ──────────────
// Breaking the monolithic refresh/check into small callables keeps each
// server-action under Vercel's function timeout, and lets the client report
// real per-source / per-batch progress.

/** Return the list of active sources for the current user (id + label only). */
export async function getActiveSourcesAction() {
  const u = await requireUser()
  const sources = await db.select({ id: jobSources.id, label: jobSources.label })
    .from(jobSources)
    .where(and(eq(jobSources.userId, u.id), eq(jobSources.active, true)))
  return { sources }
}

/**
 * Tick a single source. When fullMode=true the source's lastFetchedAt is
 * reset to null before fetching so tickSource uses the first-fetch page
 * budget (500 Naukri results) and enriches existing leads on conflict.
 */
export async function tickSingleSourceAction(sourceId: number, fullMode = false) {
  const u = await requireUser()
  // Cap how fast the client orchestration can hammer this — 60/min/user is
  // more than enough for any real refresh fan-out but protects Groq quota
  // from a stolen session looping the endpoint.
  if (!rateLimit(`tick-single:${u.id}`, 60, 60_000)) return { added: 0, status: 'rate-limited' as const }
  // Verify ownership BEFORE the reset write so a tampered ID can't
  // null someone else's lastFetchedAt.
  const [source] = await db.select().from(jobSources)
    .where(and(eq(jobSources.id, sourceId), eq(jobSources.userId, u.id)))
  if (!source) return { added: 0, status: 'not-found' as const }
  if (fullMode) {
    await db.update(jobSources)
      .set({ lastFetchedAt: null })
      .where(and(eq(jobSources.id, sourceId), eq(jobSources.userId, u.id)))
    source.lastFetchedAt = null
  }
  try {
    const r = await svc.tickSource(source)
    revalidatePath('/jobs')
    return { added: r.added, status: r.status }
  } catch (e) {
    return { added: 0, status: 'error' as const, error: e instanceof Error ? e.message : 'failed' }
  }
}

/** Return all new/saved leads that have a link (for client-side 404 checks). */
export async function getLeadsWithLinksAction() {
  const u = await requireUser()
  const leads = await db.select({ id: jobLeads.id, link: jobLeads.link })
    .from(jobLeads)
    .where(and(
      eq(jobLeads.userId, u.id),
      inArray(jobLeads.status, ['new', 'saved']),
      ne(jobLeads.link, ''),
    ))
  return { leads }
}

/**
 * Check a batch of lead IDs for dead links and ignore them.
 * Called repeatedly by the client in batches of ~20 to show progress.
 */
export async function checkLinksBatchAction(leadIds: number[]) {
  const u = await requireUser()
  if (!leadIds.length) return { dead: 0 }
  // Hard cap per call — prevents the client from sending an unbounded payload.
  if (leadIds.length > 50) return { error: 'Batch too large — max 50 IDs' }
  if (!rateLimit(`dead-batch:${u.id}`, 60, 60_000)) return { error: 'Too many checks — slow down' }

  const leads = await db.select({ id: jobLeads.id, link: jobLeads.link })
    .from(jobLeads)
    .where(and(eq(jobLeads.userId, u.id), inArray(jobLeads.id, leadIds)))

  const deadIds: number[] = []
  await Promise.all(leads.map(async (l) => {
    if (await isDead(l.link)) deadIds.push(l.id)
  }))

  if (deadIds.length > 0) {
    await db.update(jobLeads)
      .set({ status: 'ignored' })
      .where(and(eq(jobLeads.userId, u.id), inArray(jobLeads.id, deadIds)))
    revalidatePath('/jobs')
  }

  return { dead: deadIds.length }
}

export async function validateJobSourceAction(url: string, keywords: string) {
  const u = await requireUser()
  if (!rateLimit(`job-validate:${u.id}`, 5, 60_000)) return { error: 'Slow down — wait a minute' }
  const sanity = validateUrlForFetch(url)
  if (!sanity.ok) return { error: `URL rejected: ${sanity.error}` }
  try {
    const isNaukri = /naukri\.com/i.test(url)
    let jobs: Array<{ title: string; company?: string; location?: string; salary?: string }>
    if (isNaukri) {
      jobs = await fetchNaukriApiPublic(url, 1)
    } else {
      const fetched = await fetchForAi(url)
      if (!fetched.ok) return { error: `Fetch failed: ${fetched.error}` }
      jobs = await aiExtractJobsPublic(u.id, fetched.text)
    }
    const kw = keywords.trim()
    const filtered = kw
      ? jobs.filter((j) => {
          const words = kw.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
          const hay = `${j.title} ${j.company ?? ''}`.toLowerCase()
          return words.some((w) => hay.includes(w))
        })
      : jobs
    return {
      ok: true as const,
      total: filtered.length,
      sample: filtered.slice(0, 3).map((j) => ({
        title: j.title, company: j.company ?? '', location: j.location ?? '', salary: j.salary ?? '',
      })),
    }
  } catch (e) {
    return actionError(e, 'Validation failed')
  }
}
