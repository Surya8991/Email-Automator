import { describe, it, expect } from 'vitest'
import { checkSpamRisk, spamRiskBand } from '@/lib/spam-check'

describe('checkSpamRisk', () => {
  it('clean subject + body returns score 0', () => {
    const r = checkSpamRisk(
      'Quick intro re your Senior Marketer role',
      '<p>Hi {{name}},</p><p>I came across your role at {{company}} and would love to chat. Open to a 15-min call this week?</p><p>Unsubscribe</p>',
    )
    expect(r.score).toBe(0)
    expect(spamRiskBand(r.score)).toBe('clean')
  })

  it('flags ALL CAPS subject', () => {
    const r = checkSpamRisk('LIMITED TIME OFFER FOR YOU', '<p>Hi {{name}},</p><p>Body is fine for a normal length and unsubscribe link too.</p><p>Unsubscribe</p>')
    expect(r.hits.find((h) => h.rule === 'ALL_CAPS_SUBJECT')).toBeTruthy()
  })

  it('flags excessive exclamation', () => {
    const r = checkSpamRisk('Hello!!!', '<p>Wow!! This is amazing!! Click here!!</p>')
    expect(r.hits.find((h) => h.rule === 'EXCESSIVE_EXCLAMATION')).toBeTruthy()
  })

  it('flags classic spam triggers', () => {
    const r = checkSpamRisk('Hello', '<p>Hi {{name}}, FREE! offer guaranteed. Act now!</p><p>Unsubscribe</p>')
    expect(r.hits.find((h) => h.rule === 'CLASSIC_SPAM_WORDS')).toBeTruthy()
  })

  it('flags URL-heavy body', () => {
    const r = checkSpamRisk('Hi', '<p>https://a.com https://b.com https://c.com https://d.com</p>')
    expect(r.hits.find((h) => h.rule === 'URL_HEAVY')).toBeTruthy()
  })

  it('flags missing body', () => {
    const r = checkSpamRisk('Quick check', '<p>hi</p>')
    expect(r.hits.find((h) => h.rule === 'MISSING_BODY')).toBeTruthy()
  })

  it('flags missing personalization', () => {
    const r = checkSpamRisk('Quick intro re your role', '<p>Hi there, I noticed your company and wanted to connect about an opportunity.</p><p>Unsubscribe</p>')
    expect(r.hits.find((h) => h.rule === 'MISSING_PERSONALIZATION')).toBeTruthy()
  })

  it('flags suspicious TLDs', () => {
    const r = checkSpamRisk('Hi {{name}}', '<p>Check this <a href="https://offer.tk/promo">link</a> for {{name}}. Unsubscribe link below.</p><p>Unsubscribe</p>')
    expect(r.hits.find((h) => h.rule === 'SUSPICIOUS_TLD')).toBeTruthy()
  })

  it('flags currency shout', () => {
    const r = checkSpamRisk('Hi {{name}}', '<p>Earn $$$ daily! Body of normal length so MISSING_BODY does not fire here ok. Unsubscribe.</p>')
    expect(r.hits.find((h) => h.rule === 'CURRENCY_SHOUT')).toBeTruthy()
  })

  it('flags missing unsub link', () => {
    const r = checkSpamRisk('Hi {{name}}', '<p>Body of completely normal length without the magic word at the end. {{name}} you are great.</p>')
    expect(r.hits.find((h) => h.rule === 'NO_UNSUB_LINK')).toBeTruthy()
  })

  it('bands roll into mild / loud as score climbs', () => {
    expect(spamRiskBand(0)).toBe('clean')
    expect(spamRiskBand(2)).toBe('clean')
    expect(spamRiskBand(3)).toBe('mild')
    expect(spamRiskBand(5)).toBe('mild')
    expect(spamRiskBand(6)).toBe('loud')
    expect(spamRiskBand(20)).toBe('loud')
  })
})
