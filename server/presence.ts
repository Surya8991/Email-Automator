/**
 * Lightweight presence tracker — in-memory, per-Lambda-instance.
 *
 * **Caveat:** on Vercel (or any multi-instance host), each Lambda
 * has its own Map. Two users hitting the same campaign through
 * different Lambdas won't see each other. This is documented honestly
 * in /guide and shown to the user via the "approx" label on the
 * presence pill. For globally consistent presence, swap this for a
 * Redis SET with TTL — `register()` does the upsert via XADD + EXPIRE,
 * `peers()` reads via SMEMBERS. That swap is one function each.
 *
 * For a single-instance deploy or a single-region setup this is
 * accurate enough.
 */

interface Peer {
  userId: string
  email: string
  lastBeat: number
}

// resource → Map<userId, Peer>. We track per-resource so the
// "campaign 7" peers don't bleed into "campaign 8".
const ROOMS = new Map<string, Map<string, Peer>>()

const STALE_MS = 45_000 // 45 s — heartbeat is 30 s, allow 1 missed beat.
const EVICT_INTERVAL_MS = 60_000

// Periodic GC so a long-running Lambda doesn't grow ROOMS unbounded.
// Runs at most once per minute; cheap walk.
let lastEvict = 0
function evictStale(now: number) {
  if (now - lastEvict < EVICT_INTERVAL_MS) return
  lastEvict = now
  for (const [resource, peers] of ROOMS.entries()) {
    for (const [userId, peer] of peers.entries()) {
      if (now - peer.lastBeat > STALE_MS) peers.delete(userId)
    }
    if (peers.size === 0) ROOMS.delete(resource)
  }
}

export function heartbeat(resource: string, userId: string, email: string) {
  const now = Date.now()
  evictStale(now)
  let peers = ROOMS.get(resource)
  if (!peers) { peers = new Map(); ROOMS.set(resource, peers) }
  peers.set(userId, { userId, email, lastBeat: now })
}

export function listPeers(resource: string, excludeUserId: string): Array<{ email: string; ageMs: number }> {
  const now = Date.now()
  evictStale(now)
  const peers = ROOMS.get(resource)
  if (!peers) return []
  const result: Array<{ email: string; ageMs: number }> = []
  for (const peer of peers.values()) {
    if (peer.userId === excludeUserId) continue
    const age = now - peer.lastBeat
    if (age > STALE_MS) continue
    result.push({ email: peer.email, ageMs: age })
  }
  return result
}
