import { requireUser } from '@/auth'
import { register } from '@/server/sse'

// SSE — authenticated; each connection is tagged with the session user so
// server-side emits only reach that user's open tabs.
export async function GET() {
  const u = await requireUser()
  const userId = u.id

  // Capture cleanup in a closure shared between start() and cancel() so
  // client disconnect triggers proper teardown of the interval and registry.
  let cleanup: (() => void) | undefined
  const stream = new ReadableStream({
    start(controller) {
      const unregister = register(userId, controller)
      controller.enqueue(new TextEncoder().encode(`: connected\n\n`))
      // Heartbeat every 25s so proxies / browsers keep the connection open.
      const beat = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)) } catch { clearInterval(beat) }
      }, 25_000)
      cleanup = () => { clearInterval(beat); unregister() }
    },
    cancel() { cleanup?.() },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
