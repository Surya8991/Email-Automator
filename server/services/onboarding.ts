import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { templates } from '@/server/db/schema'
// Import the JSON so Next's bundler traces it into the serverless function.
// (Previously we read it with fs.readFileSync(process.cwd() + …), which works
// locally but Vercel's Node File Tracing didn't include the file in the
// deploy bundle — new users on prod ended up with zero templates.)
import SEED from '../../data/seed-templates.json' assert { type: 'json' }

// First-time seed: if the user has zero templates, load the 20 starter
// templates. Idempotent — once they have any templates, never runs again.
// Wrapped in try/catch by the caller so a write failure doesn't block sign-in.
type Tpl = {
  category?: string; label?: string; subject: string;
  initialMsg: string; follow1Msg?: string; lastFollowMsg?: string
}
const seed = SEED as Record<string, Tpl>

export async function ensureSeededTemplatesFor(userId: string): Promise<void> {
  const existing = await db.select({ id: templates.id }).from(templates).where(eq(templates.userId, userId)).limit(1)
  if (existing.length > 0) return
  if (Object.keys(seed).length === 0) return
  for (const [key, t] of Object.entries(seed)) {
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
