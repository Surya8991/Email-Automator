import { describe, it, expect } from 'vitest'
import { parseWebhookUrl } from '@/server/services/notify'

describe('notify.parseWebhookUrl', () => {
  it('accepts Slack incoming-webhook URLs', () => {
    const u = parseWebhookUrl('https://hooks.slack.com/services/T0/B0/secret')
    expect(u).not.toBeNull()
    expect(u?.hostname).toBe('hooks.slack.com')
  })
  it('accepts Discord webhook URLs', () => {
    const u = parseWebhookUrl('https://discord.com/api/webhooks/123/abc')
    expect(u).not.toBeNull()
    expect(u?.hostname).toBe('discord.com')
  })
  it('rejects non-https URLs (no plaintext webhook leaks)', () => {
    expect(parseWebhookUrl('http://hooks.slack.com/x')).toBeNull()
  })
  it('rejects unknown hosts (SSRF defense)', () => {
    expect(parseWebhookUrl('https://attacker.example/proxy')).toBeNull()
    expect(parseWebhookUrl('https://localhost:6379/SETEX')).toBeNull()
    expect(parseWebhookUrl('https://169.254.169.254/latest/meta-data/')).toBeNull()
  })
  it('rejects garbage input', () => {
    expect(parseWebhookUrl('')).toBeNull()
    expect(parseWebhookUrl('not-a-url')).toBeNull()
    expect(parseWebhookUrl('javascript:alert(1)')).toBeNull()
  })
})
