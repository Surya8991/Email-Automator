// Per-user progress fan-out. Keeps two channels in sync:
//
//   - In-process SSE (Map<userId, Set<controller>>) — used on self-hosted /
//     single-instance setups where emitter and reader live in the same node.
//   - DB-backed "last event" row in the dedicated progress_events table —
//     used by the polling endpoint on Vercel where SSE doesn't survive the
//     Lambda boundary between emitter and reader.
//
// Callers just call emit(uid, data). The hook on the client uses whichever
// transport works.
//
// progress_events is a single-row-per-user table with userId as PRIMARY KEY,
// so the upsert is a clean INSERT-OR-REPLACE — no delete+insert race, no
// per-user promise chain. See migration 0005_progress_events.
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { progressEvents } from '@/server/db/schema'

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

// Single-statement upsert. SQLite's `INSERT … ON CONFLICT DO UPDATE` and
// libsql's equivalent both honor this. Atomic — no inter-statement
// window for a concurrent emit to slip in. The previous delete+insert
// pattern (when this was layered on top of the settings table) needed a
// per-user promise chain to avoid the same race; that's gone now.
async function persistLatest(userId: string, at: number, data: unknown) {
  const payload = JSON.stringify({ at, data })
  try {
    await db.insert(progressEvents).values({ userId, at, payload })
      .onConflictDoUpdate({
        target: progressEvents.userId,
        set: { at, payload },
      })
  } catch { /* non-fatal — SSE will still deliver to local clients */ }
}

export function emit(userId: string, data: unknown): void {
  const at = Date.now()
  const set = clients.get(userId)
  if (set) {
    // Include the server-issued `at` in the SSE wire payload so the client
    // can use the same timestamp for dedup as the polling fallback.
    const payload = encoder.encode(`data: ${JSON.stringify({ at, data })}\n\n`)
    for (const c of set) {
      try { c.enqueue(payload) } catch { /* client gone */ }
    }
  }
  // Fire-and-forget — doesn't block the emitter, atomic upsert means a
  // later emit's row always wins over an earlier one in the DB.
  void persistLatest(userId, at, data)
}

/**
 * Read the latest progress event for this user, IF newer than `since`. Used
 * by the polling endpoint that runs as a fallback to SSE on environments
 * where the emitter and SSE consumer don't share a process (Vercel).
 */
export async function readLatest(userId: string, since: number): Promise<{ at: number; data: unknown } | null> {
  const [row] = await db.select().from(progressEvents).where(eq(progressEvents.userId, userId))
  if (!row || row.at <= since) return null
  try {
    const parsed = JSON.parse(row.payload) as { at?: number; data?: unknown }
    if (typeof parsed.at !== 'number' || parsed.at <= since) return null
    return { at: parsed.at, data: parsed.data }
  } catch {
    return null
  }
}

/**
 * Best-effort cleanup hook — drop the most recent event row for the user.
 * Useful when a long-running flow completes and the bar should reset. Not
 * required for correctness; readLatest already gates on `at > since`.
 */
export async function clearLatest(userId: string): Promise<void> {
  try {
    await db.delete(progressEvents).where(eq(progressEvents.userId, userId))
  } catch { /* non-fatal */ }
}

