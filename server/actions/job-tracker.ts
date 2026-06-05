'use server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { jobLeads, contacts as contactsTbl, drafts as draftsTbl } from '@/server/db/schema'
import * as svc from '@/server/services/job-tracker'
import { fetchForAi } from '@/server/services/ai-generate'
import { actionError } from '@/lib/action-error'
import { rateLimit } from '@/lib/rate-limit'

const AddSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().min(8).max(500),
  keywords: z.string().max(400).optional(),
})

export async function addJobSourceAction(input: z.infer<typeof AddSchema>) {
  const u = await requireUser()
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  if (!rateLimit(`job-add:${u.id}`, 10, 60_000)) return { error: 'Slow down — try again in a minute' }
  // Re-use the SSRF-defended URL validator from ai-generate. We don't
  // actually need the response here, only the validation — so request
  // a tiny range; if the URL fails the guard it's rejected.
  const sanity = await fetchForAi(parsed.data.url).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' } as const))
  if (!sanity.ok) {
    return { error: `URL rejected: ${'error' in sanity ? sanity.error : 'invalid'}` }
  }
  try {
    await svc.createSource(u.id, parsed.data.label, parsed.data.url, parsed.data.keywords ?? '')
    revalidatePath('/jobs')
    return { ok: true as const }
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
    // Bare-bones draft body — the user customizes it. Subject uses
    // {{name}} / {{company}} so it personalizes when an email is added.
    const subject = `Re: ${lead.title} role at ${lead.company || '{{company}}'}`
    const body =
      `<p>Hi {{name}},</p>` +
      `<p>I saw the ${lead.title}${lead.company ? ` role at ${lead.company}` : ''}` +
      `${lead.location ? ` (${lead.location})` : ''} and wanted to reach out — would you be open to a quick chat?</p>` +
      `<p>Best,<br/>{{your_name}}</p>`
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
