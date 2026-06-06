// Ordered registry of dedicated-fetch adapters. The orchestrator
// (tickSource in ../job-tracker.ts) iterates this list, picking the first
// adapter whose matches(url) returns true. JSON-LD + AI fallbacks are
// invoked manually by the orchestrator when no dedicated adapter matched
// or the matched adapter returned [].
//
// Order matters: more-specific patterns first, so e.g. RSS doesn't
// accidentally capture a Naukri URL that happens to end in /rss.

import type { Adapter } from './types'
import { naukriAdapter } from './naukri'
import { founditAdapter } from './foundit'
import { rssAdapter } from './rss'
import { remoteOkAdapter } from './remote-ok'
import { remotiveAdapter } from './remotive'
import { atsAdapter } from './ats'
import { adzunaAdapter } from './adzuna'
import { joobleAdapter } from './jooble'
import { workdayAdapter } from './workday'
import { internshalaAdapter } from './internshala'
import { personioAdapter } from './personio'
import { recruiteeAdapter } from './recruitee'
import { teamtailorAdapter } from './teamtailor'

export const REGISTRY: Adapter[] = [
  // India-specific first — more-specific URL patterns win.
  naukriAdapter,
  founditAdapter,
  internshalaAdapter,
  // Meta-aggregators.
  adzunaAdapter,
  joobleAdapter,
  // Vendor-specific ATSes (host patterns).
  workdayAdapter,
  personioAdapter,
  recruiteeAdapter,
  teamtailorAdapter,
  atsAdapter, // Lever/Greenhouse/Ashby/SmartRecruiters/BreezyHR/Workable/Freshteam
  // Generic last — RSS catches feeds, RemoteOK/Remotive catch their hosts.
  rssAdapter,
  remoteOkAdapter,
  remotiveAdapter,
]

/** Find the first adapter that matches the source URL. */
export function findAdapter(url: string): Adapter | null {
  for (const a of REGISTRY) {
    if (a.matches(url)) return a
  }
  return null
}
