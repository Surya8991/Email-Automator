// Seed the starter templates from data/seed-templates.json (+ overlay for
// admin emails from data/seed-templates.admin.json) into a user's templates
// table. Idempotent, re-runs upsert via templates.key.
//
//   npm run seed:templates                  # seeds test@gmail.com (the dev user)
//   npm run seed:templates -- you@x.co      # seeds an arbitrary user
//   npm run seed:templates -- you@x.co --prune
//     # delete templates that aren't in the seed anymore but only from
//     # the curated starter categories (Starter/Universal + the four
//     # marketing categories). User-created templates with other
//     # category strings are left alone.
import '../lib/env'
import fs from 'node:fs'
import path from 'node:path'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '../server/db/client'
import { users, templates } from '../server/db/schema'
import { adminEmails } from '../lib/env'

// Parse args independent of order: every "--flag" goes into flags,
// the first non-flag positional is the target email. Fixes the
// earlier bug where `npm run seed:templates -- --prune you@x.co`
// silently retargeted test@gmail.com because args[0] was the flag.
const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('--')))
const positional = rawArgs.filter((a) => !a.startsWith('--'))
const targetEmail = (positional[0] ?? 'test@gmail.com').toLowerCase()
const prune = flags.has('--prune')
// Curated category set: only delete obsolete rows that belong to one of
// our seed categories. User-created templates with arbitrary category
// strings stay untouched even when --prune is on.
const SEED_CATEGORIES = [
  'Starter', 'Universal', 'Growth Marketer', 'Performance Marketing',
  'SEO Analyst', 'Digital Marketing Executive',
]
const dataDir = path.join(process.cwd(), 'data')
const publicFile = path.join(dataDir, 'seed-templates.json')
const adminFile = path.join(dataDir, 'seed-templates.admin.json')
if (!fs.existsSync(publicFile)) {
  console.error(`[seed] not found: ${publicFile}`)
  process.exit(1)
}

type Tpl = {
  category?: string
  label?: string
  subject: string
  initialMsg: string
  follow1Msg?: string
  lastFollowMsg?: string
}
const publicSeed = JSON.parse(fs.readFileSync(publicFile, 'utf8')) as Record<string, Tpl>
const adminSeed = fs.existsSync(adminFile)
  ? (JSON.parse(fs.readFileSync(adminFile, 'utf8')) as Record<string, Tpl>)
  : {}

async function main() {
  const user = (await db.select().from(users).where(eq(users.email, targetEmail)))[0]
  if (!user) {
    console.error(`[seed] user not found: ${targetEmail}. Sign in once at /login first.`)
    process.exit(1)
  }
  const isAdmin = adminEmails.includes(targetEmail)
  const seed: Record<string, Tpl> = isAdmin ? { ...publicSeed, ...adminSeed } : publicSeed
  let added = 0, updated = 0
  for (const [key, t] of Object.entries(seed)) {
    const existing = (await db.select().from(templates)
      .where(eq(templates.userId, user.id))).find((r) => r.key === key)
    if (existing) {
      await db.update(templates).set({
        label: t.label ?? '',
        category: t.category ?? '',
        subject: t.subject,
        initialMsg: t.initialMsg,
        follow1Msg: t.follow1Msg ?? '',
        lastFollowMsg: t.lastFollowMsg ?? '',
        version: existing.version + 1,
        updatedAt: new Date(),
      }).where(eq(templates.id, existing.id))
      updated++
    } else {
      await db.insert(templates).values({
        userId: user.id,
        key,
        label: t.label ?? '',
        category: t.category ?? '',
        subject: t.subject,
        initialMsg: t.initialMsg,
        follow1Msg: t.follow1Msg ?? '',
        lastFollowMsg: t.lastFollowMsg ?? '',
      })
      added++
    }
  }
  let pruned = 0
  if (prune) {
    const seedKeys = Object.keys(seed)
    if (seedKeys.length === 0) {
      // Empty seed would mark every curated template as stale and
      // wipe the user's starter pack. Refuse to prune in that case.
      console.warn('[seed] refusing to prune: seed has 0 keys (would delete all curated templates)')
    } else {
      // Only touch rows whose category is in the curated set AND whose key
      // is no longer in the seed. Keeps user-created templates safe.
      const stale = await db.select().from(templates)
        .where(and(
          eq(templates.userId, user.id),
          inArray(templates.category, SEED_CATEGORIES),
          notInArray(templates.key, seedKeys),
        ))
      if (stale.length > 0) {
        await db.delete(templates).where(and(
          eq(templates.userId, user.id),
          inArray(templates.id, stale.map((r) => r.id)),
        ))
        pruned = stale.length
      }
    }
  }
  console.log(`[seed] ${targetEmail} (${isAdmin ? 'admin' : 'public'}): +${added} new, ~${updated} updated${prune ? `, -${pruned} pruned` : ''} (${Object.keys(seed).length} in seed)`)
}

main().catch((e) => { console.error('[seed]', e); process.exit(1) })
