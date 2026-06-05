'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { setSetting } from '@/server/services/settings'
import { notify, parseWebhookUrl, type NotifyEvent } from '@/server/services/notify'
import { rateLimit } from '@/lib/rate-limit'

const ALLOWED_EVENTS: NotifyEvent[] = ['send.completed', 'send.failed', 'bounce', 'reply']

const SaveSchema = z.object({
  webhookUrl: z.string().trim().max(500).optional(),
  // Comma-separated event names. Validated against ALLOWED_EVENTS below.
  events: z.string().trim().max(200).optional(),
})

export async function saveNotifySettingsAction(input: z.infer<typeof SaveSchema>) {
  const u = await requireUser()
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const { webhookUrl = '', events = '' } = parsed.data
  if (webhookUrl) {
    // Whitelist check — reject unknown hosts up front so the user sees
    // a clear error instead of "notifications mysteriously stopped".
    if (!parseWebhookUrl(webhookUrl)) {
      return { error: 'Only https://hooks.slack.com/… and https://discord.com/… URLs are allowed.' }
    }
  }
  // Filter events to the whitelist — silently dropping anything unknown
  // so a future enum bump doesn't trip up the saved value.
  const cleanEvents = events
    .split(',').map((s) => s.trim())
    .filter((s): s is NotifyEvent => (ALLOWED_EVENTS as string[]).includes(s))
    .join(',')
  await setSetting(u.id, 'NOTIFY_WEBHOOK_URL', webhookUrl)
  await setSetting(u.id, 'NOTIFY_EVENTS', cleanEvents)
  revalidatePath('/profile')
  return { ok: true as const }
}

/**
 * Fire a test notification to the configured webhook so the user can
 * verify it actually reaches Slack/Discord before depending on it.
 * Rate-limited 6/min/user — frequent enough for iteration, low enough
 * that a stuck UI loop can't get the user's app rate-limited by Slack.
 */
export async function testNotifyAction() {
  const u = await requireUser()
  if (!rateLimit(`notify-test:${u.id}`, 6, 60_000)) {
    return { error: 'Too many test sends — slow down' }
  }
  await notify(u.id, 'send.completed', {
    title: 'Test notification',
    detail: 'If you can read this, your webhook is wired up correctly.',
    meta: { triggered_from: 'profile/test-button', user: u.email },
  })
  return { ok: true as const }
}
