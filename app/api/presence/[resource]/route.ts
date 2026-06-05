import { requireUser } from '@/auth'
import { heartbeat, listPeers } from '@/server/presence'

/**
 * POST /api/presence/[resource] — heartbeat. The client pings this
 * every 30 s while a user is on a presence-aware page (e.g. a
 * campaign detail). Returns the list of *other* peers currently
 * viewing the same resource, so the UI can show "1 other editing".
 *
 * `resource` is an opaque string. Today we use `campaign-<id>`; future
 * pages can add their own namespaces without coordinating here.
 *
 * Multi-tenant safety: the presence tracker is global by resource
 * key, but it only ever stores (userId, email). It does NOT store any
 * row data. A peer in "campaign-7" only knows another peer is in
 * "campaign-7" — they can't see what that other peer typed.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const u = await requireUser()
  const { resource } = await params
  if (!resource || resource.length > 80) return Response.json({ peers: [] })
  heartbeat(resource, u.id, u.email)
  const peers = listPeers(resource, u.id).map((p) => ({ email: p.email, ageSec: Math.floor(p.ageMs / 1000) }))
  return Response.json({ peers })
}
