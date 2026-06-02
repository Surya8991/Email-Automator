// Bearer-token middleware for /api/v1/*. Reads `Authorization: Bearer <key>`,
// looks the key up in api_keys, returns the userId + scopes or a 401/403
// Response.
//
// Scope catalog:
//   - "read:contacts"  — GET /api/v1/contacts
//   - "write:contacts" — POST/PUT/DELETE /api/v1/contacts
//   - empty string     — back-compat for pre-0004 keys; treated as all scopes
//
// Usage in a route:
//
//   export async function GET(req: Request) {
//     const auth = await requireBearer(req, ['read:contacts'])
//     if (auth instanceof Response) return auth
//     // … use auth.userId …
//   }
import { NextResponse } from 'next/server'
import { userIdAndScopesFromKey } from '@/server/services/api-keys'

export type Scope = 'read:contacts' | 'write:contacts'
export const ALL_SCOPES: Scope[] = ['read:contacts', 'write:contacts']

/** Parse a "comma,separated,list" of scopes. Empty / missing = no scopes. */
function parseScopes(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))
}

export async function requireBearer(req: Request, required: Scope[] = []): Promise<{ userId: string; scopes: Set<string> } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(\S+)$/i)
  if (!m) return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 })
  const r = await userIdAndScopesFromKey(m[1]!)
  if (!r) return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })
  const granted = parseScopes(r.scopes)
  // Empty scopes string = back-compat: keys created before 0004 had no
  // scopes column; they keep working as full-access until rotated.
  if (granted.size === 0) return { userId: r.userId, scopes: new Set(ALL_SCOPES) }
  for (const s of required) {
    if (!granted.has(s)) {
      return NextResponse.json({ error: `Key missing scope: ${s}`, requiredScopes: required }, { status: 403 })
    }
  }
  return { userId: r.userId, scopes: granted }
}
