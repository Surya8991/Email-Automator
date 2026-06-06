'use server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { jobLeads, contacts as contactsTbl, drafts as draftsTbl } from '@/server/db/schema'
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
    let addedTotal = 0
    let scanned = 0
    for (const s of sources) {
      if (!s.active) continue
      const r = await svc.tickSource(s)
      addedTotal += r.added
      scanned++
    }
    revalidatePath('/jobs')
    return { ok: true as const, scanned, addedTotal }
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
    let addedTotal = 0, enriched = 0, scanned = 0
    for (const s of sources) {
      if (!s.active) continue
      const r = await svc.tickSource(s)
      addedTotal += r.added
      scanned++
    }
    revalidatePath('/jobs')
    return { ok: true as const, scanned, addedTotal, enriched }
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
    const metaLines: string[] = []
    if (lead.company)  metaLines.push(`<strong>Company:</strong> ${lead.company}`)
    if (lead.location) metaLines.push(`<strong>Location:</strong> ${lead.location}`)
    if (lead.salary)   metaLines.push(`<strong>Salary:</strong> ${lead.salary}`)
    if (lead.link)     metaLines.push(`<strong>Listing:</strong> <a href="${lead.link}">${lead.link}</a>`)
    const descSnippet = lead.description
      ? `<blockquote style="border-left:3px solid #ccc;padding-left:1em;margin:0.5em 0;color:#555;font-size:0.9em">${lead.description.slice(0, 300)}${lead.description.length > 300 ? '…' : ''}</blockquote>`
      : ''
    const metaBlock = metaLines.length
      ? `<p style="font-size:0.85em;color:#666">${metaLines.join(' &nbsp;·&nbsp; ')}</p>`
      : ''
    const body =
      `<p>Hi {{name}},</p>` +
      `<p>I came across the <strong>${lead.title}</strong>${lead.company ? ` position at <strong>${lead.company}</strong>` : ' role'}` +
      `${lead.location ? ` in ${lead.location}` : ''} and I'm very interested in applying.</p>` +
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
