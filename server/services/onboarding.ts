import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { templates } from '@/server/db/schema'

// First-time seed: if the user has zero templates, load the 20 starter
// templates from standalone/data/templates.json. Idempotent — once they
// have any templates, never runs again. Wrapped in try/catch by the caller
// so a missing file or write failure doesn't block sign-in.
let SEED: Record<string, {
  category?: string; label?: string; subject: string;
  initialMsg: string; follow1Msg?: string; lastFollowMsg?: string
}> | null = null

function loadSeed() {
  if (SEED !== null) return SEED
  // Bundled at ./data/seed-templates.json — copied from the v1 standalone
  // templates.json during the v3 root-restructure so the legacy folder isn't
  // a runtime dependency.
  const p = path.join(process.cwd(), 'data', 'seed-templates.json')
  if (fs.existsSync(p)) {
    try {
      SEED = JSON.parse(fs.readFileSync(p, 'utf8'))
      return SEED
    } catch { /* fall through */ }
  }
  SEED = {}
  return SEED
}

export async function ensureSeededTemplatesFor(userId: string): Promise<void> {
  const existing = await db.select({ id: templates.id }).from(templates).where(eq(templates.userId, userId)).limit(1)
  if (existing.length > 0) return
  const seed = loadSeed()
  if (!seed || Object.keys(seed).length === 0) return
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
