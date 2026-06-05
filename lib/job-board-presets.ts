// Popular job-board / aggregator URL templates with placeholders. Users
// pick a preset → fill in role + location → we generate the actual
// search URL and pass it to addJobSourceAction. The fetcher's SSRF
// guard still runs on every URL, so a preset isn't a way to bypass
// validation.
//
// Templates use {role} and {location} placeholders. URL-encoding is
// done at substitute() time, not in the template, so the templates
// stay human-readable.

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
}

export const JOB_BOARD_PRESETS: JobBoardPreset[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn Jobs',
    description: 'Public LinkedIn job search. Best for senior + tech roles.',
    template: 'https://www.linkedin.com/jobs/search/?keywords={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🟦',
  },
  {
    id: 'wellfound',
    name: 'Wellfound (AngelList)',
    description: 'Startup-heavy listings. Good for product / growth / early-stage.',
    template: 'https://wellfound.com/jobs?role={role}&location={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🚀',
  },
  {
    id: 'naukri',
    name: 'Naukri',
    description: 'India\'s biggest board. Best for IN-based roles.',
    template: 'https://www.naukri.com/{role}-jobs-in-{location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🇮🇳',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    description: 'Aggregator across many sources. Heavier listings.',
    template: 'https://www.indeed.com/jobs?q={role}&l={location}',
    needs: { role: true, location: true },
    suggestedKeywords: '{role}',
    icon: '🔵',
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    description: 'Remote-only listings, tag-driven.',
    template: 'https://remoteok.com/remote-{role}-jobs',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🌐',
  },
  {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    description: 'Curated remote roles, paid-listing only (higher signal).',
    template: 'https://weworkremotely.com/categories/remote-{role}-jobs',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}, remote',
    icon: '🌍',
  },
  {
    id: 'ycombinator',
    name: 'Y Combinator Work',
    description: 'YC-backed startup roles. Senior IC + leadership weighted.',
    template: 'https://www.ycombinator.com/jobs/role/{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '{role}',
    icon: '🟠',
  },
  {
    id: 'greenhouse-search',
    name: 'Greenhouse company URL',
    description: 'Paste a Greenhouse board URL (e.g. boards.greenhouse.io/notion).',
    template: '{role}', // user supplies the URL directly via the role field
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟢',
  },
  {
    id: 'lever-search',
    name: 'Lever company URL',
    description: 'Paste a Lever board URL (e.g. jobs.lever.co/example).',
    template: '{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🟣',
  },
  {
    id: 'company-careers',
    name: 'Company careers page',
    description: 'Paste a /careers or /jobs page URL on a company\'s own site.',
    template: '{role}',
    needs: { role: true, location: false },
    suggestedKeywords: '',
    icon: '🏢',
  },
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
    url = url
      .replace('{role}', encodeURIComponent(cleanRole.replace(/\s+/g, preset.id === 'naukri' || preset.id === 'remoteok' || preset.id === 'weworkremotely' ? '-' : ' ')))
      .replace('{location}', encodeURIComponent(cleanLoc.replace(/\s+/g, preset.id === 'naukri' ? '-' : ' ')))
  }
  const label = `${preset.name}${cleanRole ? ` — ${cleanRole}` : ''}${cleanLoc ? ` (${cleanLoc})` : ''}`.slice(0, 120)
  const keywords = (preset.suggestedKeywords ?? '').replace('{role}', cleanRole)
  return { url, label, keywords }
}
