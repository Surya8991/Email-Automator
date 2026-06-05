// Shared rate-limiter helper for admin write actions. Lives in lib/ (not
// server/actions/) because server-action files require every export to be
// an async function — a sync `adminLimit()` is rejected by Turbopack at
// build time. Keeping this helper here lets every admin action file
// (admin.ts, campaigns.ts, schedule.ts) import the same bucket key
// without re-implementing the rateLimit call.
import { rateLimit } from './rate-limit'

// 60/min/admin per op. Stops accidental loops (a stuck onClick that fires
// every key event, or a malicious script in a console) from chewing
// through the audit log or Groq quota.
export function adminLimit(adminId: string, op: string): boolean {
  return rateLimit(`admin-write:${adminId}:${op}`, 60, 60_000)
}
