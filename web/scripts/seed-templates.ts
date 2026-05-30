// Seed the 20 pre-made templates from standalone/data/templates.json into a
// user's templates table. Idempotent — re-runs upsert via templates.key.
//
//   npm run seed:templates                  # seeds test@gmail.com (the dev user)
//   npm run seed:templates -- you@x.co      # seeds an arbitrary user
import '../lib/env'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { users, templates } from '../server/db/schema'

const args = process.argv.slice(2)
const targetEmail = (args[0] ?? 'test@gmail.com').toLowerCase()
const file = path.join(process.cwd(), '..', 'standalone', 'data', 'templates.json')
if (!fs.existsSync(file)) {
  console.error(`[seed] not found: ${file}`)
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
const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Tpl>

async function main() {
  const user = (await db.select().from(users).where(eq(users.email, targetEmail)))[0]
  if (!user) {
    console.error(`[seed] user not found: ${targetEmail}. Sign in once at /login first.`)
    process.exit(1)
  }
  let added = 0, updated = 0
  for (const [key, t] of Object.entries(raw)) {
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
  console.log(`[seed] ${targetEmail}: +${added} new, ~${updated} updated (${Object.keys(raw).length} total)`)
}

main().catch((e) => { console.error('[seed]', e); process.exit(1) })
