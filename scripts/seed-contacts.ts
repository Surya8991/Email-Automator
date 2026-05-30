// Seed N fake contacts for the given user — dev convenience for testing
// pagination, search, tags, and bulk operations.
//   npm run seed:contacts                          # 50 contacts into test@gmail.com
//   npm run seed:contacts -- you@x.co 200          # 200 contacts into you@x.co
import '../lib/env'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { contacts, users } from '../server/db/schema'

const args = process.argv.slice(2)
const targetEmail = (args[0] ?? 'test@gmail.com').toLowerCase()
const count = Math.max(1, Math.min(10_000, parseInt(args[1] ?? '50', 10) || 50))

const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Wonka', 'Tyrell', 'Cyberdyne', 'Soylent']
const ROLES     = ['Head of Growth', 'Marketing Manager', 'Recruiter', 'CTO', 'Talent Lead', 'HR Manager']
const TAGS      = [['vc'], ['priority-a'], ['eu'], ['us'], ['follow-up'], ['vc', 'eu'], []]
const FIRST     = ['Alex', 'Sam', 'Jordan', 'Riley', 'Taylor', 'Casey', 'Morgan', 'Avery', 'Quinn', 'Rowan']
const LAST      = ['Patel', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez']

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]! }

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, targetEmail))
  if (!user) { console.error(`[seed] user not found: ${targetEmail}`); process.exit(1) }

  for (let i = 0; i < count; i++) {
    const name = `${pick(FIRST, i)} ${pick(LAST, i * 7)}`
    const company = pick(COMPANIES, i * 3)
    await db.insert(contacts).values({
      userId: user.id,
      num: i + 1,
      recruiterName: name,
      company,
      jobTitle: pick(ROLES, i * 2),
      recruiterEmail: `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@${company.toLowerCase()}.co`,
      platform: i % 3 === 0 ? 'LinkedIn' : i % 3 === 1 ? 'Job board' : 'Referral',
      tags: pick(TAGS, i * 11).join(','),
    })
  }
  console.log(`[seed] inserted ${count} contacts for ${targetEmail}`)
}

main().catch((e) => { console.error('[seed]', e); process.exit(1) })
