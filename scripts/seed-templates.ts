// Seed the starter templates from data/seed-templates.json (+ overlay for
// admin emails from data/seed-templates.admin.json) into a user's templates
// table. Idempotent — re-runs upsert via templates.key.
//
//   npm run seed:templates                  # seeds test@gmail.com (the dev user)
//   npm run seed:templates -- you@x.co      # seeds an arbitrary user
import '../lib/env'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { users, templates } from '../server/db/schema'
import { adminEmails } from '../lib/env'

const args = process.argv.slice(2)
const targetEmail = (args[0] ?? 'test@gmail.com').toLowerCase()
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
  console.log(`[seed] ${targetEmail} (${isAdmin ? 'admin' : 'public'}): +${added} new, ~${updated} updated (${Object.keys(seed).length} total)`)
}

main().catch((e) => { console.error('[seed]', e); process.exit(1) })
