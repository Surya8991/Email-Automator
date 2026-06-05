import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Verifies the curated 5 + 10 = 15 template selection (user request
// 2026-06-06) stays at the right size and stays clean of em dashes /
// stale placeholders. If you intentionally add or remove a template,
// update the count constants below and the corresponding doc lines in
// FEATURES.md and /guide.

type Tpl = {
  category?: string; label?: string; subject: string; initialMsg: string;
  follow1Msg?: string; lastFollowMsg?: string;
}

const publicSeed = JSON.parse(readFileSync(join(process.cwd(), 'data', 'seed-templates.json'), 'utf8')) as Record<string, Tpl>
const adminSeed  = JSON.parse(readFileSync(join(process.cwd(), 'data', 'seed-templates.admin.json'), 'utf8')) as Record<string, Tpl>

describe('seed templates catalog (curated 15)', () => {
  it('public seed has exactly 5 templates', () => {
    expect(Object.keys(publicSeed)).toHaveLength(5)
  })
  it('admin overlay has exactly 10 templates', () => {
    expect(Object.keys(adminSeed)).toHaveLength(10)
  })
  it('admin user gets 5 + 10 = 15 total when overlay merges', () => {
    const merged = { ...publicSeed, ...adminSeed }
    expect(Object.keys(merged)).toHaveLength(15)
  })
  it('no template subject or body contains em dashes', () => {
    // User requested em dashes be stripped across user-facing copy.
    // Templates ship straight to the user's inbox so they're the most
    // visible surface, keep this assertion tight.
    for (const [key, t] of Object.entries({ ...publicSeed, ...adminSeed })) {
      expect(t.subject, `${key}.subject`).not.toContain('—')
      expect(t.initialMsg, `${key}.initialMsg`).not.toContain('—')
      expect(t.follow1Msg ?? '', `${key}.follow1Msg`).not.toContain('—')
      expect(t.lastFollowMsg ?? '', `${key}.lastFollowMsg`).not.toContain('—')
    }
  })
  it('every template has a non-empty subject and initial message', () => {
    for (const [key, t] of Object.entries({ ...publicSeed, ...adminSeed })) {
      expect(t.subject.trim().length, `${key}.subject`).toBeGreaterThan(0)
      expect(t.initialMsg.trim().length, `${key}.initialMsg`).toBeGreaterThan(0)
    }
  })
  it('every template subject stays under 78 chars (Gmail mobile preview cut-off)', () => {
    // Use 78 to allow for short {{tokens}} expanding 5-10 chars while
    // still landing inside Gmail's ~80 char mobile clip.
    for (const [key, t] of Object.entries({ ...publicSeed, ...adminSeed })) {
      expect(t.subject.length, `${key}.subject "${t.subject}"`).toBeLessThanOrEqual(78)
    }
  })
  it('every key uses snake_case', () => {
    for (const key of Object.keys({ ...publicSeed, ...adminSeed })) {
      expect(key, key).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
  it('every category falls in the curated category set', () => {
    const allowed = new Set([
      'Starter', 'Universal', 'Growth Marketer', 'Performance Marketing',
      'SEO Analyst', 'Digital Marketing Executive',
    ])
    for (const [key, t] of Object.entries({ ...publicSeed, ...adminSeed })) {
      expect(allowed.has(t.category ?? ''), `${key}.category "${t.category}"`).toBe(true)
    }
  })
})
