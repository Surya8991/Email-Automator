import { describe, it, expect } from 'vitest'
import { JOB_BOARD_PRESETS, PRESET_CATEGORIES, buildPresetUrl, splitRoles } from '@/lib/job-board-presets'

describe('job-board-presets catalog', () => {
  it('every preset has a non-empty template + category', () => {
    for (const p of JOB_BOARD_PRESETS) {
      expect(p.template.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/)
      // Category must be declared and match one of the known categories.
      expect(PRESET_CATEGORIES.find((c) => c.id === p.category)).toBeTruthy()
    }
  })
  it('ids are unique', () => {
    const ids = JOB_BOARD_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('at least 10 marketing-specific presets exist (user request 2026-06-06)', () => {
    const marketing = JOB_BOARD_PRESETS.filter((p) => p.category === 'marketing')
    expect(marketing.length).toBeGreaterThanOrEqual(10)
  })
  it('every marketing preset requires both role and location (user request 2026-06-06)', () => {
    const marketing = JOB_BOARD_PRESETS.filter((p) => p.category === 'marketing')
    for (const p of marketing) {
      expect(p.needs.role).toBe(true)
      expect(p.needs.location).toBe(true)
    }
  })
  it('at least 10 India presets exist (user request 2026-06-06)', () => {
    // Naukri / Foundit / Shine / TimesJobs / Hirist / Cutshort /
    // Instahyre / iimjobs / Indeed India / Apna / Glassdoor IN —
    // must remain ≥10 so the India-focused user has broad coverage.
    const india = JOB_BOARD_PRESETS.filter((p) => p.category === 'india')
    expect(india.length).toBeGreaterThanOrEqual(10)
  })
  it('India category is marked as featured (recommended-first position)', () => {
    const indiaCat = PRESET_CATEGORIES.find((c) => c.id === 'india')
    expect(indiaCat).toBeTruthy()
    expect(indiaCat?.featured).toBe(true)
  })
  it('India is the first category in PRESET_CATEGORIES (default-visible)', () => {
    expect(PRESET_CATEGORIES[0]?.id).toBe('india')
  })
  it('catalog covers every declared category at least once', () => {
    for (const cat of PRESET_CATEGORIES) {
      // Every category in the picker UI should have at least one preset
      // — otherwise the picker renders a heading with no entries.
      const inCat = JOB_BOARD_PRESETS.filter((p) => p.category === cat.id)
      if (cat.id === 'general') continue // 'general' is the "anything else" fallback bucket
      expect(inCat.length).toBeGreaterThan(0)
    }
  })
})

describe('buildPresetUrl', () => {
  const linkedin = JOB_BOARD_PRESETS.find((p) => p.id === 'linkedin')!
  const naukri   = JOB_BOARD_PRESETS.find((p) => p.id === 'naukri')!
  const passthru = JOB_BOARD_PRESETS.find((p) => p.id === 'greenhouse-search')!

  it('substitutes role + location with URL encoding (LinkedIn)', () => {
    const r = buildPresetUrl(linkedin, 'Product Manager', 'Bangalore')
    expect(r.url).toContain('keywords=Product%20Manager')
    expect(r.url).toContain('location=Bangalore')
  })

  it('hyphenates role + location for Naukri-style URLs', () => {
    const r = buildPresetUrl(naukri, 'Product Manager', 'New Delhi')
    // Naukri's URL format uses Title-Case-Hyphenated, preserving the
    // original case but swapping spaces for hyphens. We just verify
    // the structure shape, not exact casing.
    expect(r.url).toContain('Product-Manager')
    expect(r.url).toContain('New-Delhi')
    expect(r.url).not.toContain(' ')
  })

  it('pass-through preset uses the role field as the URL verbatim', () => {
    const r = buildPresetUrl(passthru, 'https://boards.greenhouse.io/notion', '')
    expect(r.url).toBe('https://boards.greenhouse.io/notion')
  })

  it('label is built from preset name + role + location, capped at 120 chars', () => {
    const r = buildPresetUrl(linkedin, 'Senior Product Manager', 'Bangalore')
    expect(r.label).toContain(linkedin.name)
    expect(r.label).toContain('Senior Product Manager')
    expect(r.label).toContain('Bangalore')
    expect(r.label.length).toBeLessThanOrEqual(120)
  })

  it('suggested keywords substitute {role}', () => {
    const r = buildPresetUrl(linkedin, 'Designer', 'Remote')
    expect(r.keywords).toBe('Designer')
  })

  it('label uses a plain separator, not an em dash (user request 2026-06-06)', () => {
    const r = buildPresetUrl(linkedin, 'Product Manager', 'Bangalore')
    // The label used to be `${name} — ${role} (${loc})`; em dashes
    // were stripped to keep labels copy-paste-clean across spreadsheets.
    expect(r.label).not.toContain('—')
    expect(r.label).toContain(': Product Manager')
  })

  // Hyphenation special-cases (Naukri / Shine use path-style URLs with
  // literal hyphens; param-style boards keep URL-encoded spaces).
  it('Shine uses hyphenated role + location like Naukri', () => {
    const shine = JOB_BOARD_PRESETS.find((p) => p.id === 'shine')!
    const r = buildPresetUrl(shine, 'Performance Marketing', 'New Delhi')
    expect(r.url).toContain('Performance-Marketing')
    expect(r.url).toContain('New-Delhi')
    expect(r.url).not.toContain(' ')
  })
  it('Foundit (param-style) uses URL-encoded spaces, not hyphens', () => {
    const foundit = JOB_BOARD_PRESETS.find((p) => p.id === 'foundit')!
    const r = buildPresetUrl(foundit, 'Paid Media', 'Bangalore')
    expect(r.url).toContain('Paid%20Media')
    expect(r.url).toContain('Bangalore')
  })
  it('TimesJobs (param-style) uses %20 spaces', () => {
    const tj = JOB_BOARD_PRESETS.find((p) => p.id === 'timesjobs')!
    const r = buildPresetUrl(tj, 'Digital Marketing', 'Mumbai')
    expect(r.url).toContain('Digital%20Marketing')
    expect(r.url).toContain('Mumbai')
  })
})

describe('splitRoles (multi-role preset picker)', () => {
  it('returns [] for empty input', () => {
    expect(splitRoles('')).toEqual([])
    expect(splitRoles('   ')).toEqual([])
  })
  it('returns a single-element array for a single role', () => {
    expect(splitRoles('Product Manager')).toEqual(['Product Manager'])
  })
  it('splits comma-separated roles and trims', () => {
    expect(splitRoles('SEO, Performance Marketing, Paid Media')).toEqual([
      'SEO', 'Performance Marketing', 'Paid Media',
    ])
  })
  it('also accepts semicolons and newlines as separators', () => {
    expect(splitRoles('SEO; Paid Media\nGrowth')).toEqual(['SEO', 'Paid Media', 'Growth'])
  })
  it('de-duplicates identical entries', () => {
    expect(splitRoles('SEO, SEO, Growth')).toEqual(['SEO', 'Growth'])
  })
  it('drops empty and over-long entries', () => {
    const long = 'x'.repeat(200)
    expect(splitRoles(`SEO, , ${long}, Growth`)).toEqual(['SEO', 'Growth'])
  })
})
