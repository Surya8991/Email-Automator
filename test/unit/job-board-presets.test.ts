import { describe, it, expect } from 'vitest'
import { JOB_BOARD_PRESETS, buildPresetUrl } from '@/lib/job-board-presets'

describe('job-board-presets catalog', () => {
  it('every preset has a non-empty template', () => {
    for (const p of JOB_BOARD_PRESETS) {
      expect(p.template.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
  it('ids are unique', () => {
    const ids = JOB_BOARD_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
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
})
