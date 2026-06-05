'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/auth'
import { actionError } from '@/lib/action-error'
import * as svc from '@/server/services/companies'

const CompanySchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(120).optional(),
  hq: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  funding: z.string().max(120).optional(),
  glassdoor: z.string().max(120).optional(),
  techStack: z.string().max(500).optional(),
  salaryRange: z.string().max(120).optional(),
  hiringFreq: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
  sourceUrl: z.string().max(500).optional(),
})

export async function saveCompanyAction(input: z.infer<typeof CompanySchema>) {
  const u = await requireUser()
  const parsed = CompanySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  try {
    const id = await svc.upsertCompany(u.id, parsed.data)
    revalidatePath('/companies')
    return { ok: true as const, id }
  } catch (e) {
    return actionError(e, 'Save failed')
  }
}

export async function deleteCompanyAction(id: number) {
  const u = await requireUser()
  await svc.deleteCompany(u.id, id)
  revalidatePath('/companies')
  return { ok: true as const }
}
