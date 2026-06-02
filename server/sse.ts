// Per-user progress fan-out. Keeps two channels in sync:
//
//   - In-process SSE (Map<userId, Set<controller>>) — used on self-hosted /
//     single-instance setups where emitter and reader live in the same node.
//   - DB-backed "last event" row in settings (key=PROGRESS_LATEST) — used by
//     the polling endpoint on Vercel where SSE doesn't survive the Lambda
//     boundary between emitter and reader.
//
// Callers just call emit(uid, data). The hook on the client uses whichever
// transport works.
import { and, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'

type Controller = ReadableStreamDefaultController<Uint8Array>
const clients = new Map<string, Set<Controller>>()
const encoder = new TextEncoder()

export function register(userId: string, controller: Controller): () => void {
  let set = clients.get(userId)
  if (!set) {
    set = new Set()
    clients.set(userId, set)
  }
  set.add(controller)
  return () => {
    set!.delete(controller)
    if (set!.size === 0) clients.delete(userId)
  }
}

// Persist the latest event to the settings table. Polling clients read this
// row; the timestamp lets them skip events they've already seen.
async function persistLatest(userId: string, data: unknown) {
  const payload = JSON.stringify({ at: Date.now(), data })
  try {
    // Two-step upsert (delete + insert) — dialect-portable across better-sqlite3 / libsql.
    await db.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, 'PROGRESS_LATEST')))
    await db.insert(settings).values({ userId, key: 'PROGRESS_LATEST', value: payload })
  } catch { /* non-fatal — SSE will still deliver to local clients */ }
}

export function emit(userId: string, data: unknown): void {
  const set = clients.get(userId)
  if (set) {
    const payload = encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
    for (const c of set) {
      try { c.enqueue(payload) } catch { /* client gone */ }
    }
  }
  // Fire-and-forget — we don't want to slow the emitter on a slow DB.
  void persistLatest(userId, data)
}

/**
 * Read the latest progress event for this user, IF newer than `since`. Used
 * by the polling endpoint that runs as a fallback to SSE on environments
 * where the emitter and SSE consumer don't share a process (Vercel).
 */
export async function readLatest(userId: string, since: number): Promise<{ at: number; data: unknown } | null> {
  const [row] = await db.select().from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'PROGRESS_LATEST')))
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as { at?: number; data?: unknown }
    if (typeof parsed.at !== 'number' || parsed.at <= since) return null
    return { at: parsed.at, data: parsed.data }
  } catch {
    return null
  }
}
