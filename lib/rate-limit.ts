// Tiny in-memory sliding-window limiter. Sufficient for single-instance
// self-hosted deployments. For multi-instance (Vercel / horizontal scale),
// swap for Redis. Keyed by anything (IP, user id, IP+route, …).

interface Bucket { hits: number[] }
const buckets = new Map<string, Bucket>()

/**
 * Returns true if the call is allowed; false if it should be rate-limited.
 * Sliding window: at most `max` calls in the last `windowMs`.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key) ?? { hits: [] }
  b.hits = b.hits.filter((t) => t > now - windowMs)
  if (b.hits.length >= max) {
    buckets.set(key, b)
    return false
  }
  b.hits.push(now)
  buckets.set(key, b)
  // Garbage-collect when the map gets large — cheap O(n) sweep.
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (v.hits.length === 0 || v.hits[v.hits.length - 1]! < now - windowMs) buckets.delete(k)
    }
  }
  return true
}

// Hint that the caller is the same network party — for limiter purposes
// `x-forwarded-for` first hop is best-effort when behind a proxy. Falls
// back to "anon" when nothing is available (single-shared bucket).
export function clientKey(req: Request, route: string): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon'
  return `${route}:${ip}`
}
