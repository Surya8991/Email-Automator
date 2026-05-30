// Bearer-token middleware for /api/v1/*. Reads `Authorization: Bearer <key>`,
// looks the key up in api_keys, returns the userId or a 401 Response.
//
//   export async function GET(req: Request) {
//     const auth = await requireBearer(req)
//     if (auth instanceof Response) return auth
//     // … use auth.userId …
//   }
import { NextResponse } from 'next/server'
import { userIdFromKey } from '@/server/services/api-keys'

export async function requireBearer(req: Request): Promise<{ userId: string } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(\S+)$/i)
  if (!m) return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 })
  const userId = await userIdFromKey(m[1]!)
  if (!userId) return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  return { userId }
}
