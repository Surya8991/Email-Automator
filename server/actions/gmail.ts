'use server'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { campaignEnrollments, contacts, events } from '@/server/db/schema'
import { detectBounces, detectReplies, fetchGmailSignature } from '@/server/services/google'
import { setSetting } from '@/server/services/settings'
import { dispatchAsync } from '@/server/services/webhooks'
import { actionError } from '@/lib/action-error'
import { formatDate } from '@/lib/utils'

/** Fetch the user's Gmail signature and save it as their app signature. */
export async function fetchSignatureAction() {
  const u = await requireUser()
  try {
    const sig = await fetchGmailSignature(u.id)
    if (!sig) return { ok: true, signature: '', message: 'No signature found in your Gmail settings.' }
    await setSetting(u.id, 'CACHED_SIGNATURE', sig)
    revalidatePath('/profile')
    revalidatePath('/settings')
    return { ok: true, signature: sig, message: `Imported ${sig.length} chars.` }
  } catch (e) {
    return actionError(e, 'Gmail fetch failed', { action: 'fetchSignature' })
  }
}

/** Scan Gmail inbox for replies to any contact in 'Sent' status, mark them Replied. */
export async function checkRepliesAction() {
  const u = await requireUser()
  try {
    const sent = await db.select().from(contacts).where(and(
      eq(contacts.userId, u.id),
      sql`${contacts.emailStatus} LIKE '%Sent%'`,
      sql`${contacts.emailStatus} NOT LIKE '%Replied%'`,
    ))
    if (sent.length === 0) return { ok: true, checked: 0, replied: 0 }

    // Cap the per-call work — Gmail API has quotas. The UI can re-click.
    const sample = sent.slice(0, 50)
    const repliedEmails = await detectReplies(u.id, sample.map((c) => c.recruiterEmail))
    let updated = 0
    for (const c of sample) {
      if (!repliedEmails.has(c.recruiterEmail.toLowerCase())) continue
      await db.update(contacts).set({
        emailStatus: `Replied! (${formatDate(new Date())})`,
      }).where(eq(contacts.id, c.id))
      await db.insert(events).values({
        userId: u.id, contactId: c.id, kind: 'reply',
        meta: JSON.stringify({ email: c.recruiterEmail }),
      })
      // Mark any active campaign enrollments for this contact as 'replied'
      // so the scheduler's stopOnReply gate can act immediately on the next tick.
      await db.update(campaignEnrollments)
        .set({ status: 'replied' })
        .where(and(eq(campaignEnrollments.contactId, c.id), eq(campaignEnrollments.status, 'active')))
      dispatchAsync(u.id, 'reply', { contactId: c.id, email: c.recruiterEmail })
      updated++
    }
    revalidatePath('/contacts')
    revalidatePath('/dashboard')
    return { ok: true, checked: sample.length, total: sent.length, replied: updated }
  } catch (e) {
    return actionError(e, 'Gmail check failed')
  }
}

/** Scan Gmail for mailer-daemon / postmaster bounces and tag matching contacts. */
export async function checkBouncesAction() {
  const u = await requireUser()
  try {
    const bouncedEmails = await detectBounces(u.id)
    if (bouncedEmails.size === 0) return { ok: true, bouncedFound: 0, marked: 0 }

    const matches = await db.select().from(contacts).where(and(
      eq(contacts.userId, u.id),
      inArray(contacts.recruiterEmail, Array.from(bouncedEmails)),
    ))
    let marked = 0
    for (const c of matches) {
      if ((c.emailStatus ?? '').includes('BOUNCED')) continue
      await db.update(contacts).set({ emailStatus: 'BOUNCED' }).where(eq(contacts.id, c.id))
      await db.insert(events).values({
        userId: u.id, contactId: c.id, kind: 'bounce',
        meta: JSON.stringify({ email: c.recruiterEmail }),
      })
      dispatchAsync(u.id, 'bounce', { contactId: c.id, email: c.recruiterEmail })
      marked++
    }
    revalidatePath('/contacts')
    return { ok: true, bouncedFound: bouncedEmails.size, marked }
  } catch (e) {
    return actionError(e, 'Gmail check failed')
  }
}
