'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/webhooks'
import { dispatch } from '@/server/services/webhooks'

const NewSchema = z.object({
  url: z.string().url(),
  events: z.string().min(1).max(200).optional(),
})

export async function createWebhookAction(input: z.infer<typeof NewSchema>) {
  const u = await requireUser()
  const parsed = NewSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const w = await svc.createWebhook(u.id, parsed.data)
  revalidatePath('/settings')
  return { ok: true, id: w.id, secret: w.secret }
}

export async function deleteWebhookAction(id: number) {
  const u = await requireUser()
  await svc.deleteWebhook(u.id, id)
  revalidatePath('/settings')
  return { ok: true }
}

// Fire a synthetic "test" event at every subscriber — useful for verifying
// from the UI without waiting for a real send to happen.
export async function testWebhooksAction() {
  const u = await requireUser()
  await dispatch(u.id, 'test', { hello: 'world', when: new Date().toISOString() })
  revalidatePath('/settings')
  return { ok: true }
}
