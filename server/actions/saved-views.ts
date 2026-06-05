'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import * as svc from '@/server/services/saved-views'

const ALLOWED_KEYS = ['search', 'tag', 'status', 'company', 'location', 'platform']

const SaveSchema = z.object({
  name: z.string().min(1).max(80),
  filters: z.record(z.string(), z.string()).optional(),
})

export async function createSavedViewAction(input: z.infer<typeof SaveSchema>) {
  const u = await requireUser()
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  // Whitelist the filter keys so a malicious payload can't stuff
  // arbitrary URL params into the saved blob.
  const f: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.data.filters ?? {})) {
    if (ALLOWED_KEYS.includes(k) && v) f[k] = v
  }
  try {
    await svc.createSavedView(u.id, 'contacts', parsed.data.name, f)
    revalidatePath('/contacts')
    return { ok: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save failed' }
  }
}

export async function deleteSavedViewAction(id: number) {
  const u = await requireUser()
  await svc.deleteSavedView(u.id, id)
  revalidatePath('/contacts')
  return { ok: true as const }
}
