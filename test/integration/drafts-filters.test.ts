/**
 * Filter logic for the CreateDraftsDialog — countEligible() + the
 * widened createDraftsBulk() filters. We run against a real in-memory
 * SQLite so the SQL WHERE clauses (LIKE, NOT EXISTS) are exercised end
 * to end, not just typechecked.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import * as schema from '@/server/db/schema'

const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

vi.mock('@/server/db/client', () => ({ db, schema }))
vi.mock('@/server/services/mailer', () => ({ sendMail: vi.fn(async () => ({ messageId: 't' })) }))
vi.mock('@/server/sse', () => ({ emit: vi.fn(), register: vi.fn(() => () => {}) }))

let draftsSvc: typeof import('@/server/services/drafts')
let templatesSvc: typeof import('@/server/services/templates')

beforeAll(async () => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'server/db/migrations') })
  draftsSvc = await import('@/server/services/drafts')
  templatesSvc = await import('@/server/services/templates')
})

beforeEach(() => {
  sqlite.prepare('DELETE FROM email_log').run()
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

async function seedContacts(userId: string, rows: Array<Partial<typeof schema.contacts.$inferInsert>>) {
  for (const r of rows) {
    await db.insert(schema.contacts).values({
      userId,
      recruiterEmail: r.recruiterEmail ?? `${crypto.randomUUID()}@test.co`,
      recruiterName: r.recruiterName ?? 'X',
      company: r.company ?? '',
      jobTitle: r.jobTitle ?? '',
      location: r.location ?? '',
      platform: r.platform ?? '',
    })
  }
}

describe('drafts.countEligible filters', () => {
  it('returns eligible vs total when no filters set', async () => {
    const u = await newUser()
    await seedContacts(u, [
      { recruiterEmail: 'a@x.co' },
      { recruiterEmail: 'b@x.co' },
      { recruiterEmail: '' }, // missing email → ineligible
    ])
    const r = await draftsSvc.countEligible(u)
    expect(r.total).toBe(3)
    expect(r.eligible).toBe(2)
  })

  it('platform filter narrows by case-insensitive substring', async () => {
    const u = await newUser()
    await seedContacts(u, [
      { recruiterEmail: 'a@x.co', platform: 'LinkedIn' },
      { recruiterEmail: 'b@x.co', platform: 'linkedin via referral' },
      { recruiterEmail: 'c@x.co', platform: 'Naukri' },
    ])
    const r = await draftsSvc.countEligible(u, { platforms: ['LinkedIn'] })
    expect(r.eligible).toBe(2)
  })

  it('jobTitleContains is case-insensitive substring', async () => {
    const u = await newUser()
    await seedContacts(u, [
      { recruiterEmail: 'a@x.co', jobTitle: 'Senior Product Manager' },
      { recruiterEmail: 'b@x.co', jobTitle: 'product designer' },
      { recruiterEmail: 'c@x.co', jobTitle: 'Engineer' },
    ])
    const r = await draftsSvc.countEligible(u, { jobTitleContains: 'PRODUCT' })
    expect(r.eligible).toBe(2)
  })

  it('platform + location ANDs together', async () => {
    const u = await newUser()
    await seedContacts(u, [
      { recruiterEmail: 'a@x.co', platform: 'LinkedIn', location: 'Bangalore' },
      { recruiterEmail: 'b@x.co', platform: 'LinkedIn', location: 'Mumbai' },
      { recruiterEmail: 'c@x.co', platform: 'Naukri', location: 'Bangalore' },
    ])
    const r = await draftsSvc.countEligible(u, { platforms: ['LinkedIn'], locationContains: 'bangalore' })
    expect(r.eligible).toBe(1)
  })

  it('skipRecentDays excludes recipients sent to inside the window', async () => {
    const u = await newUser()
    await seedContacts(u, [
      { recruiterEmail: 'old@x.co' },
      { recruiterEmail: 'fresh@x.co' },
      { recruiterEmail: 'never@x.co' },
    ])
    const tooOld = Date.now() - 60 * 24 * 60 * 60 * 1000   // 60 days ago
    const recent = Date.now() - 3 * 24 * 60 * 60 * 1000    // 3 days ago
    await db.insert(schema.emailLog).values([
      { userId: u, email: 'old@x.co', subject: 's', body: '', scheduledAt: tooOld, status: 'Sent', scheduleId: 'old-1' },
      { userId: u, email: 'fresh@x.co', subject: 's', body: '', scheduledAt: recent, status: 'Sent', scheduleId: 'fresh-1' },
    ])
    const r = await draftsSvc.countEligible(u, { skipRecentDays: 30 })
    // 'fresh' excluded (sent 3d ago, within 30d); 'old' kept (sent 60d ago); 'never' kept.
    expect(r.eligible).toBe(2)
  })

  it('returns up to 5 sample matches', async () => {
    const u = await newUser()
    await seedContacts(u, Array.from({ length: 8 }, (_, i) => ({
      recruiterEmail: `u${i}@x.co`, recruiterName: `User ${i}`, company: 'Acme',
    })))
    const r = await draftsSvc.countEligible(u)
    expect(r.eligible).toBe(8)
    expect(r.sample.length).toBe(5)
    expect(r.sample[0]?.recruiterEmail).toMatch(/@x\.co$/)
  })

  it('tenancy: filters never leak across users', async () => {
    const u1 = await newUser()
    const u2 = await newUser()
    await seedContacts(u1, [{ recruiterEmail: 'a@x.co', platform: 'LinkedIn' }])
    await seedContacts(u2, [{ recruiterEmail: 'b@x.co', platform: 'LinkedIn' }])
    const r1 = await draftsSvc.countEligible(u1, { platforms: ['LinkedIn'] })
    const r2 = await draftsSvc.countEligible(u2, { platforms: ['LinkedIn'] })
    expect(r1.eligible).toBe(1)
    expect(r2.eligible).toBe(1)
    expect(r1.total).toBe(1)
  })
})

describe('drafts.createDraftsBulk with filters', () => {
  it('only drafts the filtered slice', async () => {
    const u = await newUser()
    const tpl = await templatesSvc.upsertTemplate(u, 'k', {
      label: 't', subject: 'Hi {{name}}', initialMsg: '<p>Hi {{name}}</p>',
      follow1Msg: '', lastFollowMsg: '', active: true,
    })
    await seedContacts(u, [
      { recruiterEmail: 'a@x.co', recruiterName: 'A', platform: 'LinkedIn' },
      { recruiterEmail: 'b@x.co', recruiterName: 'B', platform: 'Naukri' },
    ])
    const r = await draftsSvc.createDraftsBulk(u, tpl, 10, { platforms: ['LinkedIn'] })
    expect(r.processed).toBe(1)
    const allDrafts = await db.select().from(schema.drafts)
    expect(allDrafts.length).toBe(1)
    expect(allDrafts[0]!.toEmail).toBe('a@x.co')
  })
})
