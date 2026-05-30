// Per-user SSE fan-out. A Map<userId, Set<controller>> keeps each user's
// connections isolated so emit(uid, ...) never reaches another user.
type Controller = ReadableStreamDefaultController<Uint8Array>
const clients = new Map<string, Set<Controller>>()
const encoder = new TextEncoder()

export function register(userId: string, controller: Controller): () => void {
  let set = clients.get(userId)
  if (!set) {
    set = new Set()
    clients.set(userId, set)
  }
  set.add(controller)
  return () => {
    set!.delete(controller)
    if (set!.size === 0) clients.delete(userId)
  }
}

export function emit(userId: string, data: unknown): void {
  const set = clients.get(userId)
  if (!set) return
  const payload = encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  for (const c of set) {
    try { c.enqueue(payload) } catch { /* client gone */ }
  }
}
