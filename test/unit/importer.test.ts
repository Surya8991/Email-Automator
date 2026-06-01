import { describe, it, expect } from 'vitest'
import { parseCsv } from '@/server/services/importer'

// The Universal Job Tracker Contacts sheet starts with a single emoji-title
// row, then the real header on row 2. parseCsv shares its header-detection
// path with parseXlsx (both funnel through rowsToContacts), so a CSV with
// the same shape is enough to lock in the behavior the admin importer
// depends on.
describe('importer header detection — emoji-title row', () => {
  const csv = [
    '👥 Recruiter Contacts CRM,,,,,,,,,',
    'Name,Company,Role / Title,Email,LinkedIn,Phone,Platform Met,Last Contact,Warmth,Notes',
    'Alice,Acme,Recruiter,alice@acme.co,https://linkedin/in/a,+91 99 0001,LinkedIn,2025-01-10,🔴 Cold,Sourced from event',
    'Bob,Globex,HR Manager,bob@globex.com,https://linkedin/in/b,,LinkedIn,,🟡 Warm,',
    ',NoEmailCo,Recruiter,,,,,,,',
    'Carol,Initech,Lead,not-an-email,,,,,,',
  ].join('\n')

  const { contacts, errors } = parseCsv(csv)

  it('skips the emoji-title row and locks onto the real header', () => {
    expect(contacts.length).toBe(2)
    expect(contacts.map((c) => c.recruiterEmail)).toEqual(['alice@acme.co', 'bob@globex.com'])
  })

  it('maps Name/Company/Role/Email/LinkedIn/Phone/Platform correctly', () => {
    const a = contacts[0]!
    expect(a.recruiterName).toBe('Alice')
    expect(a.company).toBe('Acme')
    expect(a.jobTitle).toBe('Recruiter')
    expect(a.sourceUrl).toBe('https://linkedin/in/a')
    expect(a.platform).toBe('LinkedIn')
    // Phone gets folded into notes by the importer.
    expect(a.notes).toContain('+91 99 0001')
  })

  it('rejects rows with missing or malformed emails', () => {
    expect(errors.length).toBe(2)
    expect(errors.some((e) => /Missing email/i.test(e.reason))).toBe(true)
    expect(errors.some((e) => /Invalid email/i.test(e.reason))).toBe(true)
  })
})
