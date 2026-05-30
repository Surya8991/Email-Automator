import crypto from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { webhooks, type Webhook } from '@/server/db/schema'
import { logger } from '@/lib/logger'

const log = logger.child({ component: 'webhooks' })

// 32-byte secret, HMAC-SHA256 over the JSON body, sent as X-EA-Signature.
// Subscribers verify with the secret to confirm the event is from us.
export function generateSecret(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export interface NewWebhook { url: string; events?: string }

export async function listWebhooks(userId: string): Promise<Webhook[]> {
  return db.select().from(webhooks).where(eq(webhooks.userId, userId)).orderBy(desc(webhooks.id))
}

export async function createWebhook(userId: string, input: NewWebhook): Promise<Webhook> {
  const ins = await db.insert(webhooks).values({
    userId,
    url: input.url,
    secret: generateSecret(),
    events: input.events ?? 'sent,open,click,reply,bounce,unsubscribe',
  }).returning()
  return ins[0]!
}

export async function deleteWebhook(userId: string, id: number) {
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
}

/** Fire all subscribed webhooks for one (userId, event). Best-effort, no
 *  retry — failures are recorded as lastStatus + lastError. Runs serially
 *  per user because the n-of-webhooks is expected to be small. */
export async function dispatch(userId: string, kind: string, payload: unknown): Promise<void> {
  const subs = await db.select().from(webhooks).where(eq(webhooks.userId, userId))
  if (subs.length === 0) return
  const body = JSON.stringify({ kind, payload, ts: Date.now() })
  await Promise.all(subs
    .filter((w) => w.events.split(',').map((s) => s.trim()).includes(kind))
    .map(async (w) => {
      const sig = crypto.createHmac('sha256', w.secret).update(body).digest('hex')
      try {
        const res = await fetch(w.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EA-Signature': sig,
            'X-EA-Event': kind,
            'User-Agent': 'Email-Automator-Webhooks/1.0',
          },
          body,
          // Cap the request — webhook subscribers should respond fast.
          signal: AbortSignal.timeout(5000),
        })
        await db.update(webhooks).set({
          lastStatus: res.status, lastDeliveryAt: new Date(), lastError: null,
        }).where(eq(webhooks.id, w.id))
        if (!res.ok) log.warn({ url: w.url, status: res.status }, 'webhook non-2xx')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await db.update(webhooks).set({
          lastStatus: 0, lastDeliveryAt: new Date(), lastError: msg.slice(0, 200),
        }).where(eq(webhooks.id, w.id))
        log.error({ err: e, url: w.url }, 'webhook delivery failed')
      }
    }))
}

/** Fire-and-forget wrapper used by event-emitting code paths so they
 *  don't await network. Returns immediately. */
export function dispatchAsync(userId: string, kind: string, payload: unknown): void {
  dispatch(userId, kind, payload).catch((e) => log.error({ err: e }, 'dispatchAsync threw'))
}
