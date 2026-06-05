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
}

export const JOB_BOARD_PRESETS: JobBoardPreset[] = [
  // ── General aggregators ─────────────────────────────────────────
  {
    id: 'linkedin',
    name: 'LinkedIn Jobs',
    description: 'Public LinkedIn job search. Best for senior + tech roles.',
    template: 'https://www.linkedin.com/jobs/search/?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟦',
    category: 'aggregator',
    bestFor: 'Senior IC + management roles',
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
    description: 'Search across companies with salary + review filters.',
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
    description: 'Tech + marketing-tech roles. Strong company database, filterable.',
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
    description: 'Performance / lifecycle / paid-media specialist roles.',
    template: 'https://martechjobs.com/?s={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, performance, paid media',
    icon: '📈',
    category: 'marketing',
    bestFor: 'Performance + paid media',
  },
  {
    id: 'thedrum',
    name: 'The Drum Jobs',
    description: 'Marketing-industry publication job board. UK + EU heavy.',
    template: 'https://www.thedrum.com/jobs?keywords={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🥁',
    category: 'marketing',
    bestFor: 'Brand + agency-side',
  },
  {
    id: 'marketerhire',
    name: 'MarketerHire',
    description: 'Vetted marketing talent — FT + freelance.',
    template: 'https://marketerhire.com/talent',
    needs: { role: false, location: false },
    suggestedKeywords: 'SEO, paid media, growth, performance, lifecycle',
    icon: '💼',
    category: 'marketing',
    bestFor: 'Freelance / fractional',
  },
  {
    id: 'workable-marketing',
    name: 'Workable — Marketing',
    description: 'ATS aggregator. Broad marketing keyword search.',
    template: 'https://jobs.workable.com/search?query={role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, digital marketing',
    icon: '🟢',
    category: 'marketing',
    bestFor: 'Aggregated mid-market roles',
  },

  // ── India boards (added 2026-06-06) ────────────────────────────
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
    description: 'Indian startup board. Strong for product / growth / engineering at funded startups.',
    template: 'https://cutshort.io/jobs?search={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '⚡',
    category: 'india',
    bestFor: 'IN startups',
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
    description: 'Vetted remote / flexible roles across industries.',
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
    description: 'Startup-heavy listings. Good for product / growth / early-stage.',
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
    description: 'YC-backed startup roles. Senior IC + leadership weighted.',
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
    description: 'Paste a /careers or /jobs page URL on a company\'s own site.',
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
export const PRESET_CATEGORIES: Array<{ id: PresetCategory; label: string; blurb: string }> = [
  { id: 'marketing',  label: 'Marketing / SEO / Paid Media', blurb: 'Domain-specific boards for SEO, digital, performance, and paid-media roles.' },
  { id: 'india',      label: 'India',                        blurb: 'India-focused job boards — Naukri, Foundit, Shine, TimesJobs, Hirist, Cutshort.' },
  { id: 'aggregator', label: 'General aggregators',          blurb: 'Cross-industry boards with broad coverage and search filters.' },
  { id: 'remote',     label: 'Remote-first',                 blurb: 'Boards that screen for fully-remote / flexible roles.' },
  { id: 'startup',    label: 'Startup-focused',              blurb: 'Early-stage and growth-stage company listings.' },
  { id: 'company',    label: 'Paste a company URL',          blurb: 'Greenhouse / Lever / careers pages — paste the URL and we fetch it like any other source.' },
  { id: 'general',    label: 'Other',                        blurb: 'Anything that didn\'t fit cleanly above.' },
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
  const label = `${preset.name}${cleanRole ? ` — ${cleanRole}` : ''}${cleanLoc ? ` (${cleanLoc})` : ''}`.slice(0, 120)
  const keywords = (preset.suggestedKeywords ?? '').replace('{role}', cleanRole)
  return { url, label, keywords }
}
