// Popular job-board / aggregator URL templates with placeholders. Users
// pick a preset → fill in role + location → we generate the actual
// search URL and pass it to addJobSourceAction. The fetcher's SSRF
// guard still runs on every URL, so a preset isn't a way to bypass
// validation.
//
// Templates use {role} and {location} placeholders. URL-encoding is
// done at substitute() time, not in the template, so the templates
// stay human-readable.

export type PresetCategory = 'general' | 'marketing' | 'remote' | 'aggregator' | 'company' | 'startup' | 'india' | 'api'

export interface JobBoardPreset {
  id: string
  name: string
  description: string
  /** URL with {role} and/or {location} placeholders. */
  template: string
  /** What kind of fields the form should show. */
  needs: { role: boolean; location: boolean }
  /** Default keyword line we suggest alongside the source. */
  suggestedKeywords?: string
  /** Compact emoji / icon hint for the picker UI. */
  icon: string
  /** Domain category — drives picker grouping. */
  category: PresetCategory
  /** When set, the picker shows this as the "best for" tag — helps
   *  marketing users find the right board without reading every line. */
  bestFor?: string
  /** Visible to non-admin users. When false (the default), the
   *  preset is admin-only — full catalogs are reserved for operators
   *  who can manage cron / Groq cost. Regular users see only a small
   *  curated `sample: true` subset so they can experience the feature
   *  without unbounded fan-out. */
  sample?: boolean
}

/** Hard cap on the number of sources a non-admin user can create.
 *  Admin users have no cap. Pairs with the sample-preset gate above. */
export const NON_ADMIN_SOURCE_CAP = 3

export const JOB_BOARD_PRESETS: JobBoardPreset[] = [
  // ── Public APIs (structured, no AI cost) ───────────────────────
  // These resolve through dedicated adapters in
  // server/services/job-adapters/* — adapter-first means the orchestrator
  // never pays Groq tokens for these sources.
  {
    id: 'greenhouse-board',
    name: 'Greenhouse company board',
    description: 'Public Greenhouse board for one company. Enter the company slug (e.g. "airbnb" for boards.greenhouse.io/airbnb). Uses the public JSON API — zero AI cost.',
    template: 'https://boards.greenhouse.io/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟢',
    category: 'api',
    bestFor: 'Greenhouse-hosted ATS',
    sample: true,
  },
  {
    id: 'lever-board',
    name: 'Lever company board',
    description: 'Public Lever board for one company. Enter the company slug (e.g. "stripe" for jobs.lever.co/stripe). Uses the public JSON API.',
    template: 'https://jobs.lever.co/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟣',
    category: 'api',
    bestFor: 'Lever-hosted ATS',
    sample: true,
  },
  {
    id: 'ashby-board',
    name: 'Ashby company board',
    description: 'Public Ashby board for one company. Enter the company slug (e.g. "linear" for jobs.ashbyhq.com/linear). Cleanest salary data of the ATSes.',
    template: 'https://jobs.ashbyhq.com/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟦',
    category: 'api',
    bestFor: 'Ashby-hosted ATS',
    sample: true,
  },
  {
    id: 'workable-board',
    name: 'Workable company board',
    description: 'Public Workable board for one company. Enter the company slug (e.g. "company-name" for apply.workable.com/company-name).',
    template: 'https://apply.workable.com/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟢',
    category: 'api',
    bestFor: 'Workable-hosted ATS',
  },
  {
    id: 'smartrecruiters-board',
    name: 'SmartRecruiters company board',
    description: 'Public SmartRecruiters board for one company. Enter the company slug from careers.smartrecruiters.com/{slug}.',
    template: 'https://careers.smartrecruiters.com/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟧',
    category: 'api',
    bestFor: 'SmartRecruiters ATS',
  },
  {
    id: 'breezyhr-board',
    name: 'Breezy HR company board',
    description: 'Public Breezy HR board for one company. Enter the company slug from {slug}.breezy.hr.',
    template: 'https://{role}.breezy.hr/',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟨',
    category: 'api',
    bestFor: 'Breezy HR ATS',
  },
  {
    id: 'adzuna-search',
    name: 'Adzuna — keyword search',
    description: 'Adzuna meta-aggregator. Requires ADZUNA_APP_ID + ADZUNA_APP_KEY env vars (free dev key at developer.adzuna.com). Covers 12 countries with salary data.',
    template: 'https://www.adzuna.com/search?q={role}&w={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔍',
    category: 'api',
    bestFor: 'Cross-country, salary data',
  },
  {
    id: 'jooble-search',
    name: 'Jooble — keyword search',
    description: 'Jooble meta-aggregator. Requires JOOBLE_API_KEY env var (free at jooble.org/api/about, ~500 req/day).',
    template: 'https://jooble.org/api/search?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔎',
    category: 'api',
    bestFor: 'Cross-country aggregator',
  },
  {
    id: 'remoteok-api',
    name: 'Remote OK — JSON API',
    description: 'Remote OK\'s public JSON feed. Filter by role tag. No AI cost.',
    template: 'https://remoteok.com/api?tags={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🌐',
    category: 'api',
    bestFor: 'Tech-leaning remote',
    sample: true,
  },
  {
    id: 'remotive-api',
    name: 'Remotive — JSON API',
    description: 'Remotive\'s public job board API. Remote-only listings; no AI cost.',
    template: 'https://remotive.com/api/remote-jobs?search={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🛰️',
    category: 'api',
    bestFor: 'Remote-only',
    sample: true,
  },

  // ── General aggregators ─────────────────────────────────────────
  // LinkedIn / Glassdoor presets were removed 2026-06-06: their
  // unauthenticated HTML returns a login wall, so the AI extractor
  // hallucinated leads from page chrome. Paste a company URL via the
  // Company category if you need to fetch a specific JD.
  {
    id: 'indeed',
    name: 'Indeed (RSS)',
    description: 'Indeed\'s public RSS feed. Stable and structured — no scraping or AI fallback needed.',
    template: 'https://www.indeed.com/rss?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔵',
    category: 'aggregator',
    bestFor: 'Maximum volume via RSS',
    sample: true,
  },
  {
    id: 'hn-hiring',
    name: 'HN Who is hiring (manual)',
    description: 'Monthly Hacker News thread. WARNING: JDs live in comment bodies, so AI extraction is unreliable — use for manual triage only.',
    template: 'https://hn.algolia.com/?q={role}&type=comment&storyText=true&prefix=Ask+HN%3A+Who+is+hiring%3F',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🟠',
    category: 'aggregator',
    bestFor: 'Manual triage only',
  },

  // ── Marketing / SEO / Performance — added 2026-06-06 ───────────
  {
    id: 'builtin-marketing',
    name: 'Built In — Marketing',
    description: 'Tech and marketing-tech roles. Strong company database, filterable.',
    template: 'https://builtin.com/jobs?search={role}&loc={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, marketing',
    icon: '🛠️',
    category: 'marketing',
    bestFor: 'Marketing at tech companies',
  },
  // Pay-to-list boards have small inventory; admin-only (`sample:false`)
  // so they don't show up by default for regular users. MarketerHire
  // (talent supply, not job board) and GrowthHackers (host has been
  // 521-down for ~12 months) were removed 2026-06-06.
  {
    id: 'martechjobs',
    name: 'MarTech Jobs',
    description: 'Performance, lifecycle, and paid-media specialist roles. Admin-only — small inventory.',
    template: 'https://martechjobs.com/?s={role}+{location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, performance, paid media',
    icon: '📈',
    category: 'marketing',
    bestFor: 'Performance and paid media',
  },
  {
    id: 'thedrum',
    name: 'The Drum Jobs',
    description: 'Marketing-industry publication job board. UK and EU heavy. Admin-only.',
    template: 'https://www.thedrum.com/jobs?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🥁',
    category: 'marketing',
    bestFor: 'Brand and agency-side',
  },
  {
    id: 'mediabistro',
    name: 'Mediabistro',
    description: 'Media, advertising, and marketing roles. Admin-only — pay-to-list, small inventory.',
    template: 'https://www.mediabistro.com/jobs?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, digital marketing, paid media',
    icon: '📺',
    category: 'marketing',
    bestFor: 'Brand and agency-side',
  },
  {
    id: 'marketinghire',
    name: 'MarketingHire.com',
    description: 'Marketing-only board. Admin-only — pay-to-list.',
    template: 'https://www.marketinghire.com/jobs/search?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, SEO, performance, paid media',
    icon: '🎯',
    category: 'marketing',
    bestFor: 'Marketing only',
  },
  {
    id: 'powderkeg',
    name: 'Powderkeg',
    description: 'Tech and marketing roles outside the coastal hubs. Admin-only.',
    template: 'https://powderkeg.com/jobs?search={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, growth, performance',
    icon: '🔥',
    category: 'marketing',
    bestFor: 'Tech marketing',
  },
  {
    id: 'talent-marketing',
    name: 'Talent.com — keyword search',
    description: 'Public aggregator with strong filters. Use a marketing-specific keyword line to focus results.',
    template: 'https://www.talent.com/jobs?k={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, digital marketing, SEO, paid media',
    icon: '🟧',
    category: 'marketing',
    bestFor: 'Volume across countries',
    sample: true,
  },

  // India boards (added 2026-06-06)
  {
    id: 'naukri',
    name: 'Naukri',
    description: 'India\'s biggest board. Broad coverage across roles + cities.',
    template: 'https://www.naukri.com/{role}-jobs-in-{location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🇮🇳',
    category: 'india',
    bestFor: 'Volume across IN',
  },
  {
    id: 'foundit',
    name: 'Foundit (ex-Monster IN)',
    description: 'Monster\'s India successor. Mid + senior coverage, strong filters.',
    template: 'https://www.foundit.in/srp/results?query={role}&locations={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟧',
    category: 'india',
    bestFor: 'Mid + senior IN',
  },
  {
    id: 'shine',
    name: 'Shine',
    description: 'HT Group\'s board. Strong for fresher → mid-level roles.',
    template: 'https://www.shine.com/job-search/{role}-jobs-in-{location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '✨',
    category: 'india',
    bestFor: 'Fresher / mid-level IN',
  },
  {
    id: 'timesjobs',
    name: 'TimesJobs',
    description: 'Times Group\'s board. Cross-industry — IT through traditional sectors.',
    template: 'https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords={role}&txtLocation={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '📰',
    category: 'india',
    bestFor: 'Cross-industry IN',
  },
  {
    id: 'hirist',
    name: 'Hirist',
    description: 'Tech-only India board. WARNING: intermittently down. Admin-only — check results before relying on it.',
    template: 'https://www.hirist.tech/s?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🛠️',
    category: 'india',
    bestFor: 'IN tech-only (flaky)',
  },
  {
    id: 'cutshort',
    name: 'Cutshort',
    description: 'Indian startup board. Strong for product, growth, and engineering at funded startups.',
    template: 'https://cutshort.io/jobs?search={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '⚡',
    category: 'india',
    bestFor: 'IN startups',
  },
  {
    id: 'instahyre',
    name: 'Instahyre',
    description: 'AI-matched tech board. Heavily curated product, engineering, and data roles.',
    template: 'https://www.instahyre.com/search-jobs/?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🤖',
    category: 'india',
    bestFor: 'Curated tech IN',
  },
  {
    id: 'iimjobs',
    name: 'iimjobs',
    description: 'Premium roles for MBA and senior management. Strategy, BD, growth leadership.',
    template: 'https://www.iimjobs.com/search?searchTerm={role}&loc={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🎓',
    category: 'india',
    bestFor: 'MBA / leadership IN',
  },
  {
    id: 'indeed-in',
    name: 'Indeed India',
    description: 'Indian Indeed search. AI-extracted from HTML — the RSS endpoint is no longer available.',
    template: 'https://in.indeed.com/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔵',
    category: 'india',
    bestFor: 'Maximum IN volume',
  },
  // Removed 2026-06-06: apna + workindia (SPA-only — no JD markup in
  // initial HTML, AI extractor returns junk). glassdoor-in + linkedin-in
  // (login wall for bots). freshteam (template was wrong host).
  {
    id: 'internshala',
    name: 'Internshala Jobs',
    description: 'India\'s biggest campus-to-mid-level platform. Strong digital marketing and tech roles.',
    template: 'https://internshala.com/jobs/{role}-jobs/',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🎒',
    category: 'india',
    bestFor: 'Campus / fresher IN',
    sample: true,
  },
  {
    id: 'naukrigulf',
    name: 'Naukri Gulf',
    description: 'Naukri\'s Middle-East platform. Good for GCC/Gulf roles for Indian professionals.',
    template: 'https://www.naukrigulf.com/{role}-jobs-in-{location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🌙',
    category: 'india',
    bestFor: 'GCC / Gulf roles',
  },

  // ── Remote-first ───────────────────────────────────────────────
  // Note: Remote OK + Remotive moved to the API category (they have
  // dedicated adapters). FlexJobs removed — paywall blocks unauth GETs.
  {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    description: 'Curated remote roles, paid-listing only (higher signal).',
    template: 'https://weworkremotely.com/categories/remote-{role}-jobs',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🌍',
    category: 'remote',
    bestFor: 'Curated remote',
    sample: true,
  },

  // ── Startup-focused ────────────────────────────────────────────
  // Y Combinator preset removed — the /jobs/role/{role} URL pattern
  // 404s for almost every role. Use the company-careers preset and
  // paste a specific YC company's careers page instead.
  {
    id: 'wellfound',
    name: 'Wellfound (AngelList)',
    description: 'Startup-heavy listings. Good for product, growth, and early-stage.',
    template: 'https://wellfound.com/jobs?role={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🚀',
    category: 'startup',
    bestFor: 'Early-stage equity roles',
    sample: true,
  },

  // ── Paste-a-URL company pages ──────────────────────────────────
  {
    id: 'greenhouse-search',
    name: 'Greenhouse company URL',
    description: 'Paste a Greenhouse board URL (e.g. boards.greenhouse.io/notion).',
    template: '{role}', // user supplies the URL directly via the role field
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟢',
    category: 'company',
    bestFor: 'Greenhouse-hosted ATS',
  },
  {
    id: 'lever-search',
    name: 'Lever company URL',
    description: 'Paste a Lever board URL (e.g. jobs.lever.co/example).',
    template: '{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟣',
    category: 'company',
    bestFor: 'Lever-hosted ATS',
  },
  {
    id: 'company-careers',
    name: 'Company careers page',
    description: 'Paste a careers or jobs page URL on a company\'s own site.',
    template: '{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🏢',
    category: 'company',
    bestFor: 'Any in-house careers page',
  },
]

// Category display order + labels for the picker. Marketing sits near
// the top because that's the recent user request; keep the rest in
// logical-discovery order.
export const PRESET_CATEGORIES: Array<{ id: PresetCategory; label: string; blurb: string; featured?: boolean }> = [
  // API-backed first — these fire dedicated adapters (Greenhouse / Lever /
  // Ashby / Workable / Adzuna / Remote OK / Remotive JSON APIs) and never
  // pay Groq tokens. Prefer these whenever a target company is known.
  { id: 'api',        label: '⚡ Public APIs',               blurb: 'ATS and aggregator JSON APIs. Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Breezy HR, Adzuna, Jooble, Remote OK, Remotive. Zero AI cost — fastest + most accurate.', featured: true },
  // India sits second — most of our active users are India-based.
  { id: 'india',      label: '🇮🇳 India',                    blurb: 'India-focused job boards: Naukri, Foundit, Shine, TimesJobs, Cutshort, Instahyre, iimjobs, Indeed IN, Internshala, Naukri Gulf. (Hirist intermittent — admin-only.)', featured: true },
  { id: 'marketing',  label: 'Marketing, SEO, Paid Media',   blurb: 'Domain-specific boards for SEO, digital, performance, and paid-media roles.' },
  { id: 'aggregator', label: 'General aggregators',          blurb: 'Cross-industry boards with broad coverage. Indeed RSS is the most reliable here.' },
  { id: 'remote',     label: 'Remote-first',                 blurb: 'Boards that screen for fully-remote or flexible roles.' },
  { id: 'startup',    label: 'Startup-focused',              blurb: 'Early-stage and growth-stage company listings.' },
  { id: 'company',    label: 'Paste a company URL',          blurb: 'Greenhouse, Lever, or careers pages. Paste the URL and we fetch it like any other source.' },
  { id: 'general',    label: 'Other',                        blurb: 'Anything that did not fit cleanly above.' },
]

/**
 * Substitute {role} and {location} with URL-encoded user input.
 * For board-URL presets (Greenhouse / Lever / Company), the user
 * pastes the full URL into the role field and we pass it through.
 */
export function buildPresetUrl(
  preset: JobBoardPreset, role: string, location: string,
): { url: string; label: string; keywords: string } {
  const cleanRole = role.trim()
  const cleanLoc = location.trim()
  let url = preset.template
  if (preset.template === '{role}') {
    // Pass-through preset (user pasted the full URL).
    url = cleanRole
  } else {
    // Boards whose URL template uses hyphenated path segments (Naukri,
    // Shine, Remote OK, We Work Remotely) need spaces converted to
    // hyphens before URL-encoding. Param-style boards (?search=…&loc=…)
    // get plain URL-encoded spaces, which all major boards accept.
    // remoteok now uses ?tags= param so no longer needs hyphen-encoding.
    const HYPHEN_ROLE = new Set(['naukri', 'naukrigulf', 'shine', 'weworkremotely'])
    const HYPHEN_LOC  = new Set(['naukri', 'naukrigulf', 'shine'])
    url = url
      .replace('{role}', encodeURIComponent(cleanRole.replace(/\s+/g, HYPHEN_ROLE.has(preset.id) ? '-' : ' ')))
      .replace('{location}', encodeURIComponent(cleanLoc.replace(/\s+/g, HYPHEN_LOC.has(preset.id) ? '-' : ' ')))
  }
  const label = `${preset.name}${cleanRole ? `: ${cleanRole}` : ''}${cleanLoc ? ` (${cleanLoc})` : ''}`.slice(0, 120)
  const keywords = (preset.suggestedKeywords ?? '').replace('{role}', cleanRole)
  return { url, label, keywords }
}

/**
 * Convenience list of preset IDs in the India category. Used by the
 * "Add all India boards" bulk-add flow in the preset picker — the
 * caller maps each id → preset → buildPresetUrl for every role.
 */
export const INDIA_PRESET_IDS = JOB_BOARD_PRESETS
  .filter((p) => p.category === 'india' && p.template !== '{role}')
  .map((p) => p.id)

/**
 * Split a comma-separated role string into individual roles so a
 * user typing "SEO, Performance Marketing, Paid Media" generates
 * three job sources in one flow instead of three dialog opens.
 *
 * Returns an array of cleaned roles; falls back to [role] if no
 * commas (so single-role callers still work transparently).
 */
export function splitRoles(roles: string): string[] {
  if (!roles.trim()) return []
  return Array.from(
    new Set(
      roles
        .split(/[,;\r\n]+/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0 && r.length <= 80),
    ),
  )
}
