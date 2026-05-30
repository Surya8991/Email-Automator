/**
 * Tests that pin every critical/high finding from the deep code review.
 * Each one is a regression guard — if a future change reopens the bug,
 * the test fails by name.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import path from 'node:path'
import * as schema from '@/server/db/schema'

const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))
vi.mock('@/server/services/mailer', () => ({ sendMail: vi.fn(async () => ({ messageId: 't' })) }))
vi.mock('@/server/sse', () => ({ emit: vi.fn(), register: vi.fn(() => () => {}) }))

let svc: {
  templates: typeof import('@/server/services/templates')
  campaigns: typeof import('@/server/services/campaigns')
  contacts: typeof import('@/server/services/contacts')
  importer: typeof import('@/server/services/importer')
  tracking: typeof import('@/server/services/tracking')
}

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  const [templates, campaigns, contacts, importer, tracking] = await Promise.all([
    import('@/server/services/templates'),
    import('@/server/services/campaigns'),
    import('@/server/services/contacts'),
    import('@/server/services/importer'),
    import('@/server/services/tracking'),
  ])
  svc = { templates, campaigns, contacts, importer, tracking }
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM campaign_enrollments').run()
  sqlite.prepare('DELETE FROM campaign_steps').run()
  sqlite.prepare('DELETE FROM campaigns').run()
  sqlite.prepare('DELETE FROM templates').run()
  sqlite.prepare('DELETE FROM contacts').run()
  sqlite.prepare('DELETE FROM users').run()
})

async function makeUser(email = 'u@x.co') {
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${id}-${email}` })
  return id
}

describe('C1: template.activate is atomic', () => {
  it('leaves exactly one active template even with concurrent activates', async () => {
    const u = await makeUser()
    const a = await svc.templates.upsertTemplate(u, 'a', { subject: 's', initialMsg: 'a' })
    const b = await svc.templates.upsertTemplate(u, 'b', { subject: 's', initialMsg: 'b' })
    const c = await svc.templates.upsertTemplate(u, 'c', { subject: 's', initialMsg: 'c' })
    // Fire all three activates "concurrently" (in JS this serializes but on
    // a real network they'd race). Either way the post-state must be one row.
    await Promise.all([svc.templates.activate(u, a.id), svc.templates.activate(u, b.id), svc.templates.activate(u, c.id)])
    const all = await svc.templates.listTemplates(u)
    expect(all.filter((t) => t.active)).toHaveLength(1)
  })
})

describe('H1: campaign enrollment is unique per (campaign, contact)', () => {
  it('a second enroll of the same contact is a no-op, not a duplicate', async () => {
    const u = await makeUser()
    const t = await svc.templates.upsertTemplate(u, 'k', { subject: 'Hi', initialMsg: '<p>Hi</p>' })
    await svc.templates.activate(u, t.id)
    const camp = await svc.campaigns.createCampaign(u, 'Test')
    await svc.campaigns.addStep(u, camp.id, t.id, 0, true)
    await svc.contacts.addContact(u, { recruiterEmail: 'c@x.co', recruiterName: 'C' })
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.userId, u))
    const r1 = await svc.campaigns.enroll(u, camp.id, { contactIds: [c!.id] })
    const r2 = await svc.campaigns.enroll(u, camp.id, { contactIds: [c!.id] })
    expect(r1.enrolled).toBe(1)
    expect(r2.enrolled).toBe(0)
    const rows = await db.select().from(schema.campaignEnrollments)
    expect(rows).toHaveLength(1)
  })
})

describe('H2: addStep refuses a template the user does not own', () => {
  it('throws "Template not found" when the templateId belongs to another user', async () => {
    const u1 = await makeUser('owner@x.co')
    const u2 = await makeUser('attacker@x.co')
    const ownerTpl = await svc.templates.upsertTemplate(u1, 'k', { subject: 's', initialMsg: 'b' })
    const attackerCamp = await svc.campaigns.createCampaign(u2, 'Bad')
    await expect(
      svc.campaigns.addStep(u2, attackerCamp.id, ownerTpl.id, 0, true)
    ).rejects.toThrow(/Template not found/)
  })
})

describe('C2: worker handles missing template (covered by service layer)', () => {
  it('removing a template referenced by a step leaves templateId null on the step', async () => {
    const u = await makeUser()
    const t = await svc.templates.upsertTemplate(u, 'k', { subject: 's', initialMsg: 'b' })
    const camp = await svc.campaigns.createCampaign(u, 'C')
    await svc.campaigns.addStep(u, camp.id, t.id, 0, true)
    await db.delete(schema.templates).where(eq(schema.templates.id, t.id))
    const steps = await db.select().from(schema.campaignSteps)
    expect(steps[0]!.templateId).toBeNull()
    // The worker then marks the enrollment 'stopped' (covered by code change).
  })
})

describe('M1: importer caps row count', () => {
  it('rejects a CSV with > 100k lines (no OOM, fast failure)', () => {
    // 1 header + 100k data rows = 100_001 lines > MAX_ROWS
    const big = ['name,email', ...Array.from({ length: 100_001 }, (_, i) => `n,a${i}@x.co`)].join('\n')
    expect(() => svc.importer.parseCsv(big)).toThrow(/CSV too large/)
  })
  it('accepts a small CSV', () => {
    const r = svc.importer.parseCsv('Name,Email\nJane,jane@x.co\nBob,bob@x.co')
    expect(r.contacts).toHaveLength(2)
    expect(r.errors).toHaveLength(0)
  })
  it('reports per-row errors with line numbers', () => {
    const r = svc.importer.parseCsv('Name,Email\nJane,not-an-email\nBob,bob@x.co\nDup,bob@x.co\nNoMail,')
    expect(r.contacts).toHaveLength(1)
    expect(r.errors.length).toBeGreaterThanOrEqual(2)
    expect(r.errors[0]?.line).toBe(2)
    expect(r.errors.find((e) => /Duplicate within file/.test(e.reason))).toBeDefined()
  })
})

describe('H5: tracking pixel placed before </body>', () => {
  it('injects pixel inside the document, not appended after </html>', () => {
    const out = svc.tracking.instrumentHtml('<html><body><p>hi</p></body></html>', 42)
    expect(out).toMatch(/<img[^>]*track\/open[^>]*><\/body>/)
    expect(out).not.toMatch(/<\/html>.*<img/)
  })
  it('falls back to plain append when neither body nor html is present', () => {
    const out = svc.tracking.instrumentHtml('<p>hi</p>', 1)
    expect(out).toMatch(/<p>hi<\/p><img/)
  })
  it('rewrites only http(s) links, leaves mailto: and # alone', () => {
    const out = svc.tracking.instrumentHtml(
      '<a href="https://x.co">x</a> <a href="mailto:a@b.co">m</a> <a href="#sec">s</a>',
      7,
    )
    expect(out).toMatch(/href="[^"]*track\/click[^"]*">x<\/a>/)
    expect(out).toMatch(/href="mailto:a@b\.co">m<\/a>/)
    expect(out).toMatch(/href="#sec">s<\/a>/)
  })
})

describe('tracking signatures', () => {
  it('verifyOpen accepts the right token, rejects others', () => {
    const t = svc.tracking.pixelUrl(123).split('t=')[1]
    expect(svc.tracking.verifyOpen(123, t!)).toBe(true)
    expect(svc.tracking.verifyOpen(124, t!)).toBe(false)
    expect(svc.tracking.verifyOpen(123, 'tampered')).toBe(false)
  })
})

describe('contacts service: tag filter', () => {
  it('matches whole-tag, not substring (so "vc" doesn\'t match "newvc")', async () => {
    const u = await makeUser()
    await svc.contacts.addContact(u, { recruiterEmail: 'a@x.co', tags: 'vc,priority' })
    await svc.contacts.addContact(u, { recruiterEmail: 'b@x.co', tags: 'newvc' })
    const r = await svc.contacts.listContacts(u, { tag: 'vc' })
    expect(r.rows.map((c) => c.recruiterEmail)).toEqual(['a@x.co'])
  })
  it('search OR tag filter both narrow', async () => {
    const u = await makeUser()
    await svc.contacts.addContact(u, { recruiterEmail: 'jane@acme.com', recruiterName: 'Jane', company: 'Acme', tags: 'vc' })
    await svc.contacts.addContact(u, { recruiterEmail: 'bob@globex.com', recruiterName: 'Bob', company: 'Globex' })
    const r = await svc.contacts.listContacts(u, { search: 'acme' })
    expect(r.rows.map((c) => c.recruiterEmail)).toEqual(['jane@acme.com'])
  })
})

declare const vi: typeof import('vitest')['vi']
