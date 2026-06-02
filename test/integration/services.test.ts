/**
 * End-to-end exercise of the contacts + templates + drafts services against
 * a real in-memory SQLite. We bypass Auth.js (which requires a request context)
 * by calling the underlying service functions directly with explicit userIds —
 * the actions layer is a thin Zod + revalidatePath wrapper on top of these.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, and } from 'drizzle-orm'
import path from 'node:path'
import * as schema from '@/server/db/schema'

// We intercept the @/server/db/client import so the services use this DB.
const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))
vi.mock('@/server/services/mailer', () => ({
  sendMail: vi.fn(async () => ({ messageId: 'test' })),
}))
vi.mock('@/server/sse', () => ({ emit: vi.fn(), register: vi.fn(() => () => {}) }))

// Imports below MUST come AFTER vi.mock — services bind to the mocked DB.
let services: typeof import('@/server/services/contacts') & {
  templates: typeof import('@/server/services/templates')
  drafts: typeof import('@/server/services/drafts')
}

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  const [contactsSvc, templatesSvc, draftsSvc] = await Promise.all([
    import('@/server/services/contacts'),
    import('@/server/services/templates'),
    import('@/server/services/drafts'),
  ])
  services = { ...contactsSvc, templates: templatesSvc, drafts: draftsSvc }
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM drafts').run()
  sqlite.prepare('DELETE FROM contacts').run()
  sqlite.prepare('DELETE FROM templates').run()
  sqlite.prepare('DELETE FROM users').run()
})

async function newUser() {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${id}@test.co` })
  return id
}

describe('contacts service', () => {
  it('addContact + listContacts + emailExists round-trip', async () => {
    const u = await newUser()
    await services.addContact(u, { recruiterEmail: 'a@x.co', recruiterName: 'A', company: 'A Co' })
    await services.addContact(u, { recruiterEmail: 'b@x.co', recruiterName: 'B', company: 'B Co' })
    const list = await services.listContacts(u, { page: 1, pageSize: 10 })
    expect(list.total).toBe(2)
    expect(list.rows.map(r => r.recruiterEmail).sort()).toEqual(['a@x.co', 'b@x.co'])
    expect(await services.emailExists(u, 'A@X.CO')).toBe(true) // case-insensitive
    expect(await services.emailExists(u, 'nope@x.co')).toBe(false)
  })

  it('search narrows by name/company/email/title', async () => {
    const u = await newUser()
    await services.addContact(u, { recruiterEmail: 'jane@acme.com', recruiterName: 'Jane', company: 'Acme' })
    await services.addContact(u, { recruiterEmail: 'bob@globex.com', recruiterName: 'Bob', company: 'Globex' })
    const r = await services.listContacts(u, { search: 'globex' })
    expect(r.rows.map(c => c.recruiterEmail)).toEqual(['bob@globex.com'])
  })

  it('deleteContact does NOT touch another user\'s rows', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    await services.addContact(u1, { recruiterEmail: 'a@x.co' })
    await services.addContact(u2, { recruiterEmail: 'a@x.co' })
    const u1Rows = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u1))
    const id = u1Rows[0]!.id
    // u2 deletes u1's id → no-op (WHERE id=? AND user_id=u2)
    await services.deleteContact(u2, id)
    expect(await services.listContacts(u1)).toMatchObject({ total: 1 })
    expect(await services.listContacts(u2)).toMatchObject({ total: 1 })
    await services.deleteContact(u1, id)
    expect(await services.listContacts(u1)).toMatchObject({ total: 0 })
  })
})

describe('contacts dedupe + delete-all', () => {
  it('dedupeContacts keeps oldest row per (name, email) tuple', async () => {
    const u = await newUser()
    // Two rows with identical (name, email) → second is a dupe.
    // Two rows with same email but different names → both kept.
    await db.insert(schema.contacts).values({ userId: u, recruiterEmail: 'a@x.co', recruiterName: 'Alice' })
    await db.insert(schema.contacts).values({ userId: u, recruiterEmail: 'A@X.CO', recruiterName: 'alice' }) // dupe (case-insensitive)
    await db.insert(schema.contacts).values({ userId: u, recruiterEmail: 'a@x.co', recruiterName: 'Bob' })  // same email, different name → KEEP
    await db.insert(schema.contacts).values({ userId: u, recruiterEmail: 'unique@x.co', recruiterName: 'Solo' })
    const r = await services.dedupeContacts(u)
    expect(r.removed).toBe(1)
    expect(r.affectedEmails).toBe(1)
    const rows = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u))
    expect(rows.length).toBe(3)
    // Alice's original row + Bob + Solo survive. The 'alice' (lowercase) row was removed.
    const names = rows.map((r) => r.recruiterName).sort()
    expect(names).toEqual(['Alice', 'Bob', 'Solo'])
  })

  it('nameAndEmailExists is case- and whitespace-insensitive', async () => {
    const u = await newUser()
    await services.addContact(u, { recruiterEmail: 'jane@acme.com', recruiterName: 'Jane Doe' })
    expect(await services.nameAndEmailExists(u, 'jane doe', 'JANE@ACME.COM')).toBe(true)
    expect(await services.nameAndEmailExists(u, '  Jane Doe  ', '  jane@acme.com  ')).toBe(true)
    // Same email, different name → not a duplicate
    expect(await services.nameAndEmailExists(u, 'Other Person', 'jane@acme.com')).toBe(false)
    // Same name, different email → not a duplicate
    expect(await services.nameAndEmailExists(u, 'Jane Doe', 'jane@other.com')).toBe(false)
  })

  it('privacy regression — u1 mutations leave u2 rows untouched', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    // Same email tuple in both tenants — distinct rows.
    await services.addContact(u1, { recruiterEmail: 'shared@x.co', recruiterName: 'Shared' })
    await services.addContact(u2, { recruiterEmail: 'shared@x.co', recruiterName: 'Shared' })
    // u1 can't see u2's row in any list path
    expect((await services.listContacts(u1)).total).toBe(1)
    expect((await services.listContacts(u2)).total).toBe(1)
    // u1's dedupe doesn't touch u2's row
    const dedupe = await services.dedupeContacts(u1)
    expect(dedupe.removed).toBe(0)
    expect((await services.listContacts(u2)).total).toBe(1)
    // u1's delete-all leaves u2 intact
    await services.deleteAllContacts(u1)
    expect((await services.listContacts(u1)).total).toBe(0)
    expect((await services.listContacts(u2)).total).toBe(1)
  })

  it('deleteAllContacts wipes everything for the user but spares other users', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    await services.addContact(u1, { recruiterEmail: 'a@x.co' })
    await services.addContact(u1, { recruiterEmail: 'b@x.co' })
    await services.addContact(u2, { recruiterEmail: 'c@x.co' })
    const n = await services.deleteAllContacts(u1)
    expect(n).toBe(2)
    expect((await services.listContacts(u1)).total).toBe(0)
    expect((await services.listContacts(u2)).total).toBe(1)
  })
})

describe('analytics.systemStats + perUserStats', () => {
  it('systemStats sums across all users', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    await services.addContact(u1, { recruiterEmail: 'a@x.co' })
    await services.addContact(u1, { recruiterEmail: 'b@x.co' })
    await services.addContact(u2, { recruiterEmail: 'c@x.co' })
    await services.templates.upsertTemplate(u1, 'k1', { subject: 's', initialMsg: 'b' })
    const { systemStats } = await import('@/server/services/analytics')
    const s = await systemStats()
    expect(s.users).toBeGreaterThanOrEqual(2)
    expect(s.contacts).toBe(3)
    expect(s.templates).toBeGreaterThanOrEqual(1)
  })

  it('perUserStats returns a map keyed by userId with per-user counts', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    await services.addContact(u1, { recruiterEmail: 'a@x.co' })
    await services.addContact(u1, { recruiterEmail: 'b@x.co' })
    await services.addContact(u2, { recruiterEmail: 'c@x.co' })
    const { perUserStats } = await import('@/server/services/analytics')
    const m = await perUserStats()
    expect(m.get(u1)?.contacts).toBe(2)
    expect(m.get(u2)?.contacts).toBe(1)
  })
})

describe('analytics.pipelineKpis', () => {
  it('buckets contacts by status and computes response rate', async () => {
    const u = await newUser()
    const statuses = ['Not Applied', 'Applied', 'Phone Screen', 'Final Round', 'Offer Extended', 'Hired', 'Rejected — culture']
    for (const s of statuses) {
      await db.insert(schema.contacts).values({ userId: u, recruiterEmail: `${s}@x.co`.replace(/\s/g, '-'), status: s })
    }
    const { pipelineKpis } = await import('@/server/services/analytics')
    const k = await pipelineKpis(u)
    // Not Applied is excluded from "applied"; everything else (6 rows) counts.
    expect(k.applied).toBe(6)
    // Applied / Phone Screen / Final Round are active pipeline.
    expect(k.pipeline).toBe(3)
    // Offer* + Hired → offers.
    expect(k.offers).toBe(2)
    // Reject* → rejections.
    expect(k.rejections).toBe(1)
    // (pipeline + offers + rejections) / applied = 6/6 = 1.0
    expect(k.responseRate).toBeCloseTo(1)
  })

  it('returns zeroed buckets when the user has no contacts', async () => {
    const u = await newUser()
    const { pipelineKpis } = await import('@/server/services/analytics')
    const k = await pipelineKpis(u)
    expect(k).toEqual({ applied: 0, pipeline: 0, offers: 0, rejections: 0, responseRate: 0 })
  })
})

describe('templates → drafts pipeline', () => {
  it('activate template + createDraftsBulk + sendDraft + status flow', async () => {
    const u = await newUser()
    const t = await services.templates.upsertTemplate(u, 'k1', {
      label: 'Initial', subject: 'Hi {{name}}', initialMsg: '<p>Hi {{name}} at {{company}}</p>',
    })
    await services.templates.activate(u, t.id)

    await services.addContact(u, { recruiterEmail: 'c1@x.co', recruiterName: 'C1', company: 'X' })
    await services.addContact(u, { recruiterEmail: 'c2@x.co', recruiterName: 'C2', company: 'Y' })

    const active = await services.templates.getActive(u)
    expect(active?.id).toBe(t.id)

    const r = await services.drafts.createDraftsBulk(u, active!, 10)
    expect(r.processed).toBe(2)

    const { rows } = await services.drafts.listDrafts(u)
    expect(rows.map(d => d.toEmail).sort()).toEqual(['c1@x.co', 'c2@x.co'])
    // listDrafts is desc-by-id, so rows[0] is the most recently inserted draft.
    const byEmail = Object.fromEntries(rows.map(r => [r.toEmail, r])) as Record<string, typeof rows[number]>
    expect(byEmail['c1@x.co']!.subject).toBe('Hi C1')
    expect(byEmail['c2@x.co']!.subject).toBe('Hi C2')

    await services.drafts.sendDraft(u, byEmail['c1@x.co']!.id)
    const evts = await db.select().from(schema.events).where(eq(schema.events.userId, u))
    expect(evts[0]?.kind).toBe('sent')
  })
})

describe('drafts bulk delete', () => {
  it('deleteDraftsBulk respects tenancy + status guard', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    // Two drafts for u1, one sent draft (protected), one draft for u2.
    const d1 = (await db.insert(schema.drafts).values({ userId: u1, toEmail: 'a@x.co', subject: 's', htmlBody: 'b' }).returning())[0]!
    const d2 = (await db.insert(schema.drafts).values({ userId: u1, toEmail: 'b@x.co', subject: 's', htmlBody: 'b' }).returning())[0]!
    const dSent = (await db.insert(schema.drafts).values({ userId: u1, toEmail: 'c@x.co', subject: 's', htmlBody: 'b', status: 'sent' }).returning())[0]!
    const dOther = (await db.insert(schema.drafts).values({ userId: u2, toEmail: 'd@x.co', subject: 's', htmlBody: 'b' }).returning())[0]!

    await services.drafts.deleteDraftsBulk(u1, [d1.id, d2.id, dSent.id, dOther.id])
    // The two pending drafts for u1 are gone.
    const remainingU1 = await db.select().from(schema.drafts).where(eq(schema.drafts.userId, u1))
    // Sent row survives (status guard); pending rows wiped.
    expect(remainingU1.map((r) => r.id).sort()).toEqual([dSent.id].sort())
    // u2's draft untouched.
    const u2Rows = await db.select().from(schema.drafts).where(eq(schema.drafts.userId, u2))
    expect(u2Rows.length).toBe(1)
    expect(u2Rows[0]!.id).toBe(dOther.id)
  })

  it('deleteAllPendingDrafts removes only drafts, not sent rows', async () => {
    const u = await newUser()
    await db.insert(schema.drafts).values({ userId: u, toEmail: 'a@x.co', subject: 's', htmlBody: 'b' })
    await db.insert(schema.drafts).values({ userId: u, toEmail: 'b@x.co', subject: 's', htmlBody: 'b', status: 'sent' })
    const n = await services.drafts.deleteAllPendingDrafts(u)
    expect(n).toBe(1)
    const rows = await db.select().from(schema.drafts).where(eq(schema.drafts.userId, u))
    expect(rows.length).toBe(1)
    expect(rows[0]!.status).toBe('sent')
  })
})

describe('blocklist bulk remove', () => {
  it('removeEntries respects tenancy + leaves globals alone', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    const r1 = (await db.insert(schema.blocklist).values({ userId: u1, pattern: 'spam1@x.co', type: 'email' }).returning())[0]!
    const r2 = (await db.insert(schema.blocklist).values({ userId: u2, pattern: 'spam2@x.co', type: 'email' }).returning())[0]!
    const rGlobal = (await db.insert(schema.blocklist).values({ userId: null, pattern: 'global.com', type: 'domain' }).returning())[0]!
    const { removeEntries } = await import('@/server/services/blocklist')
    // u1 attempts to remove all three — only its own row should go.
    await removeEntries(u1, [r1.id, r2.id, rGlobal.id])
    const remaining = await db.select().from(schema.blocklist)
    const ids = remaining.map((r) => r.id).sort()
    expect(ids).toEqual([r2.id, rGlobal.id].sort())
  })
})

describe('schedule enqueueContacts', () => {
  it('only enqueues the passed ids that belong to the caller', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    // Active template for u1 (required by enqueueContacts)
    const tpl = await services.templates.upsertTemplate(u1, 'k', { subject: 'Hi {{name}}', initialMsg: 'b' })
    await services.templates.activate(u1, tpl.id)
    // 2 eligible contacts for u1, 1 for u2
    await services.addContact(u1, { recruiterEmail: 'a@x.co', recruiterName: 'A' })
    await services.addContact(u1, { recruiterEmail: 'b@x.co', recruiterName: 'B' })
    await services.addContact(u2, { recruiterEmail: 'c@x.co', recruiterName: 'C' })
    const u1Contacts = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.userId, u1))
    const u2Contacts = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.userId, u2))
    const ids = [...u1Contacts.map((r) => r.id), ...u2Contacts.map((r) => r.id)]
    const { enqueueContacts } = await import('@/server/services/schedule')
    const r = await enqueueContacts(u1, ids, Date.now() + 60_000)
    // Only u1's 2 rows enqueued; u2's row counted as "skipped" (not eligible).
    expect(r.scheduled).toBe(2)
    expect(r.skipped).toBe(1)
  })
})

describe('unblock restores contact at end of list', () => {
  it('block soft-deletes; unblock restores with num=max+1', async () => {
    const { removeEntry, removeEntries, countBlockedContacts } = await import('@/server/services/blocklist')
    const u = await newUser()
    await services.addContact(u, { recruiterEmail: 'a@x.co', recruiterName: 'A' })
    await services.addContact(u, { recruiterEmail: 'b@x.co', recruiterName: 'B' })
    await services.addContact(u, { recruiterEmail: 'c@x.co', recruiterName: 'C' })
    // Simulate the action's effect — block one contact + add to blocklist.
    const [b] = await db.select().from(schema.contacts)
      .where(and(eq(schema.contacts.userId, u), eq(schema.contacts.recruiterEmail, 'b@x.co')))
    await db.update(schema.contacts).set({ emailStatus: 'BLOCKED' }).where(eq(schema.contacts.id, b!.id))
    const ble = await db.insert(schema.blocklist).values({ userId: u, pattern: 'b@x.co', type: 'email' }).returning()
    // Default listContacts hides BLOCKED.
    const visible = await services.listContacts(u, { page: 1, pageSize: 50 })
    expect(visible.rows.map((r) => r.recruiterEmail).sort()).toEqual(['a@x.co', 'c@x.co'])
    expect(await countBlockedContacts(u)).toBe(1)
    // removeEntry restores BLOCKED → '', bumps num to max+1.
    const before = await db.select().from(schema.contacts)
      .where(and(eq(schema.contacts.userId, u), eq(schema.contacts.recruiterEmail, 'a@x.co')))
    const maxBefore = Math.max(...(await db.select().from(schema.contacts)
      .where(eq(schema.contacts.userId, u))).map((r) => r.num ?? 0))
    const r = await removeEntry(u, ble[0]!.id)
    expect(r.restored).toBe(true)
    const restored = await db.select().from(schema.contacts)
      .where(and(eq(schema.contacts.userId, u), eq(schema.contacts.recruiterEmail, 'b@x.co')))
    expect(restored[0]!.emailStatus).toBe('')
    expect(restored[0]!.num).toBe(maxBefore + 1)
    expect(before[0]!.num).toBeLessThan(restored[0]!.num!)
    // After restore, BLOCKED count = 0, list shows three rows.
    expect(await countBlockedContacts(u)).toBe(0)
    expect((await services.listContacts(u, { page: 1, pageSize: 50 })).total).toBe(3)
  })

  it('removeEntries bulk-unblock restores all matching contacts', async () => {
    const { removeEntries } = await import('@/server/services/blocklist')
    const u = await newUser()
    await services.addContact(u, { recruiterEmail: 'x@y.co' })
    await services.addContact(u, { recruiterEmail: 'z@y.co' })
    await db.update(schema.contacts).set({ emailStatus: 'BLOCKED' })
      .where(and(eq(schema.contacts.userId, u), eq(schema.contacts.recruiterEmail, 'x@y.co')))
    await db.update(schema.contacts).set({ emailStatus: 'BLOCKED' })
      .where(and(eq(schema.contacts.userId, u), eq(schema.contacts.recruiterEmail, 'z@y.co')))
    const e1 = await db.insert(schema.blocklist).values({ userId: u, pattern: 'x@y.co', type: 'email' }).returning()
    const e2 = await db.insert(schema.blocklist).values({ userId: u, pattern: 'z@y.co', type: 'email' }).returning()
    await removeEntries(u, [e1[0]!.id, e2[0]!.id])
    const rows = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u))
    expect(rows.every((r) => r.emailStatus === '')).toBe(true)
  })
})

describe('cascade delete on user removal', () => {
  it('deleting a user wipes every owned row across the schema', async () => {
    const u = await newUser()
    // Seed at least one row in every user-owned table.
    await db.insert(schema.contacts).values({ userId: u, recruiterEmail: 'a@x.co', recruiterName: 'A' })
    const [ct] = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u))
    await db.insert(schema.templates).values({ userId: u, key: 't1', subject: 's', initialMsg: 'b' })
    const [tpl] = await db.select().from(schema.templates).where(eq(schema.templates.userId, u))
    await db.insert(schema.drafts).values({ userId: u, contactId: ct!.id, toEmail: 'a@x.co', subject: 's', htmlBody: 'b' })
    await db.insert(schema.emailLog).values({ userId: u, contactId: ct!.id, scheduleId: 's1', email: 'a@x.co', subject: 's', scheduledAt: Date.now() })
    await db.insert(schema.settings).values({ userId: u, key: 'TIMEZONE', value: 'UTC' })
    await db.insert(schema.auditLog).values({ userId: u, action: 'test.action' })
    await db.insert(schema.blocklist).values({ userId: u, pattern: 'spam@x.co', type: 'email' })
    await db.insert(schema.campaigns).values({ userId: u, name: 'C1' })
    const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.userId, u))
    await db.insert(schema.campaignSteps).values({ campaignId: camp!.id, order: 0, templateId: tpl!.id })
    await db.insert(schema.campaignEnrollments).values({ campaignId: camp!.id, contactId: ct!.id, nextRunAt: Date.now() })
    await db.insert(schema.events).values({ userId: u, contactId: ct!.id, templateId: tpl!.id, kind: 'sent' })
    await db.insert(schema.apiKeys).values({ userId: u, name: 'k', keyHash: `h-${u}`, prefix: 'abcd1234' })
    await db.insert(schema.webhooks).values({ userId: u, url: 'https://x.co/h', secret: 's' })

    // Seed a second user — proves the cascade is scoped, not a wholesale wipe.
    const u2 = await newUser()
    await db.insert(schema.contacts).values({ userId: u2, recruiterEmail: 'z@x.co' })

    await db.delete(schema.users).where(eq(schema.users.id, u))

    // Every user-scoped table must have zero rows for u.
    for (const tbl of [
      schema.contacts, schema.templates, schema.drafts, schema.emailLog,
      schema.settings, schema.auditLog, schema.blocklist, schema.campaigns,
      schema.events, schema.apiKeys, schema.webhooks,
    ]) {
      const rows = await db.select().from(tbl).where(eq(tbl.userId, u))
      expect(rows.length, `${(tbl as { _: { name?: string } })._?.name ?? 'table'} should be empty`).toBe(0)
    }
    // Cascade reached campaign children too.
    expect((await db.select().from(schema.campaignSteps)).filter((r) => r.campaignId === camp!.id)).toEqual([])
    expect((await db.select().from(schema.campaignEnrollments)).filter((r) => r.campaignId === camp!.id)).toEqual([])

    // u2's rows untouched.
    const u2Rows = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u2))
    expect(u2Rows.length).toBe(1)
  })
})

declare const vi: typeof import('vitest')['vi']
