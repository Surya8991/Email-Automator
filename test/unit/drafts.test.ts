import { describe, it, expect } from 'vitest'
import { buildEmail } from '@/server/services/drafts'
import type { Contact, Template } from '@/server/db/schema'

function tpl(overrides: Partial<Template> = {}): Template {
  return {
    id: 1, userId: 'u1', key: 'k', label: '', category: '',
    subject: 'Hi {{name}} re {{role_name}}',
    subjectB: '',
    initialMsg: '<p>Hi {{name}}, at {{company}}…</p>',
    follow1Msg: '', lastFollowMsg: '', active: true, version: 1,
    updatedAt: new Date(), ...overrides,
  }
}
function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1, userId: 'u1', num: 1,
    company: 'Acme', recruiterName: 'Jane', jobTitle: 'PM',
    recruiterEmail: 'jane@acme.com', location: '', workMode: '', jobType: '',
    platform: '', sourceUrl: '', status: '', priority: '', salary: '',
    emailStatus: '', scheduleDate: '', scheduleTime: '', notes: '',
    tags: '',
    createdAt: new Date(), ...overrides,
  }
}

describe('buildEmail', () => {
  it('substitutes variables and escapes values in HTML', () => {
    const e = buildEmail(tpl(), contact({ company: 'A<&>C', recruiterName: 'Jane Doe' }))
    expect(e.to).toBe('jane@acme.com')
    expect(e.subject).toBe('Hi Jane Doe re PM')
    expect(e.html).toContain('Hi Jane Doe')
    expect(e.html).toContain('A&lt;&amp;&gt;C') // HTML-escaped in body
  })
  it('CR/LF in name is stripped from the subject', () => {
    const e = buildEmail(tpl({ subject: 'Hi {{name}}' }), contact({ recruiterName: 'Jane\r\nBcc: x@y' }))
    expect(e.subject).not.toMatch(/[\r\n]/)
  })
})
