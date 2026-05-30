// Sample v1 JSON endpoint — list + create contacts via API key.
// Authenticate with: Authorization: Bearer ea_…
import { NextResponse } from 'next/server'
import { requireBearer } from '@/lib/bearer-auth'
import { rateLimit, clientKey } from '@/lib/rate-limit'
import { addContact, listContacts } from '@/server/services/contacts'

export async function GET(req: Request) {
  const auth = await requireBearer(req)
  if (auth instanceof Response) return auth
  if (!rateLimit(`v1:${auth.userId}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize') ?? 50)))
  const search = url.searchParams.get('search') ?? ''
  const tag = url.searchParams.get('tag') ?? ''
  const r = await listContacts(auth.userId, { page, pageSize, search, tag })
  return NextResponse.json(r)
}

export async function POST(req: Request) {
  const auth = await requireBearer(req)
  if (auth instanceof Response) return auth
  if (!rateLimit(`v1:${auth.userId}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) as {
    recruiterEmail?: string; recruiterName?: string; company?: string;
    jobTitle?: string; location?: string; platform?: string; notes?: string; tags?: string
  } | null
  if (!body?.recruiterEmail) return NextResponse.json({ error: 'recruiterEmail required' }, { status: 400 })
  try {
    await addContact(auth.userId, body as { recruiterEmail: string })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Insert failed' }, { status: 400 })
  }
}
