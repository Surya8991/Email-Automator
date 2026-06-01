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
import { eq } from 'drizzle-orm'
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

declare const vi: typeof import('vitest')['vi']
