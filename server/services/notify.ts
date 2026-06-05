import { getSetting } from './settings'
import { rateLimit } from '@/lib/rate-limit'

// Per-user Slack/Discord webhook forwarder. Fires fire-and-forget on
// significant events (send completed batch, scheduled-send failure,
// bounce detected, reply detected). Never blocks the originating
// action — every call is wrapped in a try/catch + 5s timeout.
//
// Why per-user not env: each operator picks their own Slack channel.
// Env-wide would push every user's events into one channel, which
// quickly becomes useless noise.

export type NotifyEvent =
  | 'send.completed'  // a batch send finished (sent + failed counters)
  | 'send.failed'     // a single send failed catastrophically
  | 'bounce'          // a bounce was detected via Gmail check
  | 'reply'           // a reply was detected via Gmail check

const ALLOWED_HOSTS = new Set([
  'hooks.slack.com',
  'discord.com',
  'discordapp.com',
])

/**
 * Validate a user-supplied webhook URL. Returns the parsed URL if it's
 * pointed at a known Slack/Discord host over HTTPS; null otherwise.
 *
 * This is defense in depth — without the host whitelist, a malicious
 * user could SSRF arbitrary internal endpoints (`http://localhost:6379`,
 * `http://169.254.169.254/`, etc.) by saving them and waiting for the
 * scheduler to fire. With the whitelist, the worst case is "spam your
 * own Slack."
 */
export function parseWebhookUrl(raw: string): URL | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:') return null
    if (!ALLOWED_HOSTS.has(u.hostname)) return null
    return u
  } catch { return null }
}

/**
 * Send a notification to the user's configured webhook, if any.
 * Silent no-op when no URL is configured or the URL is invalid (which
 * is the right behavior — a misconfigured webhook shouldn't break the
 * underlying send loop).
 */
export async function notify(
  userId: string,
  event: NotifyEvent,
  payload: { title: string; detail?: string; meta?: Record<string, string | number | undefined> },
): Promise<void> {
  // Rate limit per (user, event) so a runaway scheduler can't hammer
  // Slack and get the user's app banned. 30/min is generous for normal
  // use (one batch ≈ one notification) and a hard ceiling for runaways.
  if (!rateLimit(`notify:${userId}:${event}`, 30, 60_000)) return

  const url = await getSetting(userId, 'NOTIFY_WEBHOOK_URL').catch(() => '')
  if (!url) return
  const parsed = parseWebhookUrl(url)
  if (!parsed) return

  // Per-user event filter. If they didn't tick this event in their
  // settings, we skip silently — keeps Slack quiet for the events
  // they don't care about.
  const enabledRaw = await getSetting(userId, 'NOTIFY_EVENTS').catch(() => '')
  if (enabledRaw) {
    const enabled = new Set(enabledRaw.split(',').map((s) => s.trim()))
    if (!enabled.has(event)) return
  }

  const isDiscord = parsed.hostname.endsWith('discord.com') || parsed.hostname.endsWith('discordapp.com')
  // Both Slack and Discord accept a simple { content } / { text }
  // shape. Slack also accepts { text } but renders { blocks } richer
  // — we keep it plain to stay portable.
  const body = isDiscord
    ? JSON.stringify({ content: formatDiscord(event, payload) })
    : JSON.stringify({ text: formatSlack(event, payload) })

  // 5 s ceiling so a wedged Slack endpoint can't pile up requests.
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 5_000)
  try {
    await fetch(parsed.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    })
  } catch (e) {
    // Non-fatal — the originating send already happened. We don't
    // surface this to the user because there's no UI thread waiting.
    console.error('[notify] webhook POST failed:', e instanceof Error ? e.message : e)
  } finally {
    clearTimeout(t)
  }
}

const EVENT_EMOJI: Record<NotifyEvent, string> = {
  'send.completed': '✉️',
  'send.failed':    '❌',
  'bounce':         '↩️',
  'reply':          '💬',
}

function formatSlack(event: NotifyEvent, p: { title: string; detail?: string; meta?: Record<string, string | number | undefined> }): string {
  const lines: string[] = [`${EVENT_EMOJI[event]} *${p.title}*`]
  if (p.detail) lines.push(p.detail)
  if (p.meta) {
    for (const [k, v] of Object.entries(p.meta)) {
      if (v !== undefined) lines.push(`• ${k}: ${v}`)
    }
  }
  return lines.join('\n')
}

function formatDiscord(event: NotifyEvent, p: { title: string; detail?: string; meta?: Record<string, string | number | undefined> }): string {
  const lines: string[] = [`${EVENT_EMOJI[event]} **${p.title}**`]
  if (p.detail) lines.push(p.detail)
  if (p.meta) {
    for (const [k, v] of Object.entries(p.meta)) {
      if (v !== undefined) lines.push(`• ${k}: ${v}`)
    }
  }
  return lines.join('\n')
}
