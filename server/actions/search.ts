'use server'
import { and, eq, like, or, sql, desc } from 'drizzle-orm'
import { requireUser } from '@/auth'
import { db } from '@/server/db/client'
import { contacts, templates, drafts, campaigns } from '@/server/db/schema'
import { rateLimit } from '@/lib/rate-limit'

// Global ⌘K palette search — runs across the user's own contacts,
// templates, drafts, and campaigns. Returns a SHALLOW result set per
// section (max 5 each) so the palette can render quickly without a
// virtual list.
//
// Why server-action and not /api/search: the palette is the only
// consumer, the auth surface is identical, and the action layer
// already returns plain JSON. Less ceremony.

export interface SearchResult {
  href: string
  label: string
  sub?: string
  kind: 'contact' | 'template' | 'draft' | 'campaign'
}

const PER_SECTION = 5

export async function globalSearchAction(qRaw: string): Promise<{ results: SearchResult[] }> {
  const u = await requireUser()
  const q = qRaw.trim().slice(0, 80)
  // Empty query → empty results (palette renders nav links instead).
  // Avoids a flood of "give me everything" calls while the user types.
  if (q.length < 2) return { results: [] }
  // Rate-limit search to keep a runaway autocomplete from hammering the
  // DB. 60/min/user is generous for keystrokes (≈1 char/sec) plus
  // backspace.
  if (!rateLimit(`global-search:${u.id}`, 60, 60_000)) {
    return { results: [] }
  }
  const needle = `%${q.toLowerCase()}%`

  // Each query scoped to userId; LIKE on lowercased columns. Drizzle's
  // `like` is case-sensitive on libsql by default — wrap LOWER() so
  // the index isn't strictly used but matches the contact-page search.
  const [contactRows, templateRows, draftRows, campaignRows] = await Promise.all([
    db.select({
      id: contacts.id,
      name: contacts.recruiterName,
      email: contacts.recruiterEmail,
      company: contacts.company,
    }).from(contacts).where(and(
      eq(contacts.userId, u.id),
      or(
        sql`LOWER(${contacts.recruiterName}) LIKE ${needle}`,
        sql`LOWER(${contacts.recruiterEmail}) LIKE ${needle}`,
        sql`LOWER(${contacts.company}) LIKE ${needle}`,
        sql`LOWER(${contacts.jobTitle}) LIKE ${needle}`,
      )!,
    )).orderBy(desc(contacts.id)).limit(PER_SECTION),

    db.select({
      id: templates.id,
      label: templates.label,
      key: templates.key,
      category: templates.category,
    }).from(templates).where(and(
      eq(templates.userId, u.id),
      or(
        sql`LOWER(${templates.label}) LIKE ${needle}`,
        sql`LOWER(${templates.key}) LIKE ${needle}`,
        sql`LOWER(${templates.subject}) LIKE ${needle}`,
        sql`LOWER(${templates.category}) LIKE ${needle}`,
      )!,
    )).limit(PER_SECTION),

    db.select({
      id: drafts.id,
      toEmail: drafts.toEmail,
      subject: drafts.subject,
    }).from(drafts).where(and(
      eq(drafts.userId, u.id),
      eq(drafts.status, 'draft'),
      or(
        sql`LOWER(${drafts.toEmail}) LIKE ${needle}`,
        sql`LOWER(${drafts.subject}) LIKE ${needle}`,
      )!,
    )).orderBy(desc(drafts.id)).limit(PER_SECTION),

    db.select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
    }).from(campaigns).where(and(
      eq(campaigns.userId, u.id),
      sql`LOWER(${campaigns.name}) LIKE ${needle}`,
    )).orderBy(desc(campaigns.id)).limit(PER_SECTION),
  ])

  const results: SearchResult[] = []
  for (const c of contactRows) {
    results.push({
      kind: 'contact',
      href: `/contacts/${c.id}`,
      label: c.name || c.email || `Contact #${c.id}`,
      sub: [c.company, c.email].filter(Boolean).join(' · '),
    })
  }
  for (const t of templateRows) {
    results.push({
      kind: 'template',
      href: `/templates`,
      label: t.label || t.key,
      sub: [t.category, t.key].filter(Boolean).join(' · '),
    })
  }
  for (const d of draftRows) {
    results.push({
      kind: 'draft',
      href: `/drafts`,
      label: d.subject,
      sub: `to ${d.toEmail}`,
    })
  }
  for (const c of campaignRows) {
    results.push({
      kind: 'campaign',
      href: `/campaigns/${c.id}`,
      label: c.name,
      sub: c.status,
    })
  }
  return { results }
}
