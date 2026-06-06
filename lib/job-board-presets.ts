// Popular job-board / aggregator URL templates with placeholders. Users
// pick a preset → fill in role + location → we generate the actual
// search URL and pass it to addJobSourceAction. The fetcher's SSRF
// guard still runs on every URL, so a preset isn't a way to bypass
// validation.
//
// Templates use {role} and {location} placeholders. URL-encoding is
// done at substitute() time, not in the template, so the templates
// stay human-readable.

export type PresetCategory = 'general' | 'marketing' | 'remote' | 'aggregator' | 'company' | 'startup' | 'india'

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
  // ── General aggregators ─────────────────────────────────────────
  {
    id: 'linkedin',
    name: 'LinkedIn Jobs',
    description: 'Public LinkedIn job search. Best for senior and tech roles.',
    template: 'https://www.linkedin.com/jobs/search/?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟦',
    category: 'aggregator',
    bestFor: 'Senior IC and management',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    description: 'Aggregator across many sources. Heaviest volume.',
    template: 'https://www.indeed.com/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔵',
    category: 'aggregator',
    bestFor: 'Maximum volume',
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    description: 'Search across companies with salary and review filters.',
    template: 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword={role}&locKeyword={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟢',
    category: 'aggregator',
    bestFor: 'Salary visibility',
  },
  {
    id: 'hn-hiring',
    name: 'HN Who is hiring',
    description: 'Monthly Hacker News thread. Filter by keyword on the page.',
    template: 'https://hn.algolia.com/?q={role}&type=comment&storyText=true&prefix=Ask+HN%3A+Who+is+hiring%3F',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🟠',
    category: 'aggregator',
    bestFor: 'Tech startups',
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
  {
    id: 'martechjobs',
    name: 'MarTech Jobs',
    description: 'Performance, lifecycle, and paid-media specialist roles.',
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
    description: 'Marketing-industry publication job board. UK and EU heavy.',
    template: 'https://www.thedrum.com/jobs?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🥁',
    category: 'marketing',
    bestFor: 'Brand and agency-side',
  },
  {
    id: 'marketerhire',
    name: 'MarketerHire',
    description: 'Vetted marketing talent. FT and freelance.',
    template: 'https://marketerhire.com/talent?role={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, SEO, paid media, growth, performance, lifecycle',
    icon: '💼',
    category: 'marketing',
    bestFor: 'Freelance and fractional',
  },
  {
    id: 'workable-marketing',
    name: 'Workable, Marketing',
    description: 'ATS aggregator. Broad marketing keyword search.',
    template: 'https://jobs.workable.com/search?query={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, digital marketing',
    icon: '🟢',
    category: 'marketing',
    bestFor: 'Aggregated mid-market roles',
  },
  {
    id: 'mediabistro',
    name: 'Mediabistro',
    description: 'Media, advertising, and marketing roles. Strong on brand and agency-side.',
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
    description: 'Marketing-only board. SEO, performance, growth, lifecycle, content.',
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
    description: 'Tech and marketing roles outside the coastal hubs. Good for performance and growth roles.',
    template: 'https://powderkeg.com/jobs?search={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, growth, performance',
    icon: '🔥',
    category: 'marketing',
    bestFor: 'Tech marketing',
  },
  {
    id: 'talent-marketing',
    name: 'Talent.com, Marketing',
    description: 'Aggregator with strong filters. Use a marketing-specific keyword line to focus.',
    template: 'https://www.talent.com/jobs?k={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, digital marketing, SEO, paid media',
    icon: '🟧',
    category: 'marketing',
    bestFor: 'Volume across countries',
  },
  {
    id: 'growthhackers',
    name: 'GrowthHackers Jobs',
    description: 'Growth, performance, and lifecycle marketing community board.',
    template: 'https://growthhackers.com/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}, growth, performance, lifecycle',
    icon: '📊',
    category: 'marketing',
    bestFor: 'Growth and lifecycle',
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
    description: 'Tech-only India board. Strong for engineering + product + design.',
    template: 'https://www.hirist.tech/jobs?search={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🛠️',
    category: 'india',
    bestFor: 'IN tech-only',
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
    description: 'Indian variant of Indeed. Volume-heavy, broad role coverage.',
    template: 'https://in.indeed.com/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔵',
    category: 'india',
    bestFor: 'Maximum IN volume',
  },
  {
    id: 'apna',
    name: 'Apna',
    description: 'Mobile-first, fastest growing. Broad coverage from entry to mid-level.',
    template: 'https://apna.co/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '📱',
    category: 'india',
    bestFor: 'Entry / mid-level IN',
  },
  {
    id: 'glassdoor-in',
    name: 'Glassdoor India',
    description: 'India-specific Glassdoor with salary and review filters.',
    template: 'https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword={role}&locKeyword={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟢',
    category: 'india',
    bestFor: 'IN salary visibility',
  },
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
  },
  {
    id: 'workindia',
    name: 'WorkIndia',
    description: 'Mobile-first, high-volume India board. Strong in entry-mid digital and field roles.',
    template: 'https://www.workindia.in/search/job?title={role}&city={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '📲',
    category: 'india',
    bestFor: 'Entry / field IN',
  },
  {
    id: 'linkedin-in',
    name: 'LinkedIn — India',
    description: 'LinkedIn Jobs scoped to India. Best for mid-senior corporate and startup roles.',
    template: 'https://www.linkedin.com/jobs/search/?keywords={role}&location=India&geoId=102713980',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🟦',
    category: 'india',
    bestFor: 'Mid-senior IN corporate',
  },
  {
    id: 'freshteam',
    name: 'Freshteam / Freshworks ATS',
    description: 'Freshworks\' ATS used by thousands of Indian companies. Broad across tech and ops.',
    template: 'https://recruitcrm.io/apply/{role}',
    needs: { role: false, location: false },
    suggestedKeywords: '',
    icon: '🟩',
    category: 'india',
    bestFor: 'Freshworks-hosted companies',
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
  {
    id: 'remoteok',
    name: 'Remote OK',
    description: 'Remote-only listings, tag-driven.',
    template: 'https://remoteok.com/remote-{role}-jobs',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🌐',
    category: 'remote',
    bestFor: 'Tech-leaning remote',
  },
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
  },
  {
    id: 'flexjobs',
    name: 'FlexJobs',
    description: 'Vetted remote and flexible roles across industries.',
    template: 'https://www.flexjobs.com/search?searchkeyword={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote, flexible',
    icon: '🟦',
    category: 'remote',
    bestFor: 'Verified-only remote',
  },

  // ── Startup-focused ────────────────────────────────────────────
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
  },
  {
    id: 'ycombinator',
    name: 'Y Combinator Work',
    description: 'YC-backed startup roles. Senior IC and leadership weighted.',
    template: 'https://www.ycombinator.com/jobs/role/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🟠',
    category: 'startup',
    bestFor: 'YC-backed only',
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
  // India sits first — most of our active users are India-based, so
  // surface the IN boards by default. The `featured` flag drives the
  // visual "primary" treatment in the picker.
  { id: 'india',      label: '🇮🇳 India',                    blurb: 'India-focused job boards: Naukri, Foundit, Shine, TimesJobs, Hirist, Cutshort, Instahyre, iimjobs, Indeed IN, Apna, Glassdoor IN, Internshala, WorkIndia, LinkedIn India, Naukri Gulf.', featured: true },
  { id: 'marketing',  label: 'Marketing, SEO, Paid Media',   blurb: 'Domain-specific boards for SEO, digital, performance, and paid-media roles.' },
  { id: 'aggregator', label: 'General aggregators',          blurb: 'Cross-industry boards with broad coverage and search filters.' },
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
    const HYPHEN_ROLE = new Set(['naukri', 'shine', 'remoteok', 'weworkremotely'])
    const HYPHEN_LOC  = new Set(['naukri', 'shine'])
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
