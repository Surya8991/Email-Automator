// Shared types + constants for job-board adapters.
//
// Each adapter implements the Adapter interface and is registered in
// registry.ts. The orchestrator (tickSource in ../job-tracker.ts) iterates
// the registry and uses the first adapter whose matches() returns true.
// JSON-LD + AI fallbacks run last when no dedicated adapter matched or
// returned zero results.

import type { JobSource } from '@/server/db/schema'

export interface RawJob {
  title: string
  company?: string
  link?: string
  location?: string
  salary?: string
  description?: string
  postedAt?: Date | null
}

export interface FetchOpts {
  /** First-ever fetch for this source — adapters may use a larger page budget. */
  isFirstFetch: boolean
}

export interface Adapter {
  /** Stable adapter name (used for telemetry + adapterMatched UI chip). */
  name: string
  /** Cheap URL-pattern check — runs on every source before fetch. */
  matches(url: string): boolean
  /** Run the actual fetch. MUST return [] on any failure — never throw. */
  fetch(source: JobSource, opts: FetchOpts): Promise<RawJob[]>
  /**
   * When true, the orchestrator skips post-fetch keyword filtering because
   * the adapter's underlying API already filtered by keyword via the URL.
   */
  skipKeywordFilter?: boolean
}

// Pool of realistic browser UAs for boards that block default Node/undici UAs.
// getRssUA() rotates through them per-call so the fetcher looks like different
// real browser sessions — helps avoid simple round-trip bot fingerprinting on
// Naukri, Foundit, and other boards that keyed on a single static UA.
const BROWSER_UAS = [
  // Chrome 125 – Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Chrome 124 – macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Firefox 126 – Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  // Safari 17 – macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  // Edge 125 – Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
] as const

let _uaIdx = 0
export function getRssUA(): string {
  const ua = BROWSER_UAS[_uaIdx % BROWSER_UAS.length] ?? BROWSER_UAS[0]
  _uaIdx++
  return ua
}

/** Static UA kept for back-compat with callers that haven't switched yet. */
export const RSS_UA = BROWSER_UAS[0]
