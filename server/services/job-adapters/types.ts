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

// Plausible Chrome UA for boards that block default Node/undici UAs.
// Used by every adapter that makes outbound HTTP requests.
export const RSS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
