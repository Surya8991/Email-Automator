import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { templates } from '@/server/db/schema'
import { adminEmails } from '@/lib/env'
// Import the JSON so Next's bundler traces both files into the serverless
// function. (Previously we read with fs.readFileSync(process.cwd() + …), which
// works locally but Vercel's Node File Tracing didn't include the file in the
// deploy bundle — new users on prod ended up with zero templates.)
import PUBLIC_SEED from '../../data/seed-templates.json' assert { type: 'json' }
import ADMIN_SEED from '../../data/seed-templates.admin.json' assert { type: 'json' }

type Tpl = {
  category?: string; label?: string; subject: string;
  initialMsg: string; follow1Msg?: string; lastFollowMsg?: string
}
const publicSeed = PUBLIC_SEED as Record<string, Tpl>
const adminSeed = ADMIN_SEED as Record<string, Tpl>

// First-time seed: insert any starter templates the user doesn't yet have.
// Idempotent — re-runs only fill gaps, never duplicates. Admin emails
// additionally pick up the personalised overlay so a user promoted to
// admin later still gets the overlay on their next visit without a manual
// reseed. Wrapped in try/catch by the caller so a write failure doesn't
// block sign-in.
export async function ensureSeededTemplatesFor(userId: string, email = ''): Promise<void> {
  const isAdmin = adminEmails.includes(email.toLowerCase())
  const combined: Record<string, Tpl> = isAdmin
    ? { ...publicSeed, ...adminSeed }
    : publicSeed
  const keys = Object.keys(combined)
  if (keys.length === 0) return

  // Skip keys this user already has — keeps onboarding safe to re-run and
  // lets admin promotions backfill the overlay on next visit.
  const existing = await db.select({ key: templates.key }).from(templates)
    .where(eq(templates.userId, userId))
  const have = new Set(existing.map((r) => r.key))

  for (const key of keys) {
    if (have.has(key)) continue
    const t = combined[key]!
    await db.insert(templates).values({
      userId, key,
      label: t.label ?? '',
      category: t.category ?? '',
      subject: t.subject,
      initialMsg: t.initialMsg,
      follow1Msg: t.follow1Msg ?? '',
      lastFollowMsg: t.lastFollowMsg ?? '',
    })
  }
}
