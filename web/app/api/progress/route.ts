import { auth } from '@/auth'
import { register } from '@/server/sse'

// SSE — authenticated; each connection is tagged with the session user so
// server-side emits only reach that user's open tabs. (Phase 1 fix carried
// forward as the only path.)
export async function GET() {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const stream = new ReadableStream({
    start(controller) {
      const unregister = register(userId, controller)
      controller.enqueue(new TextEncoder().encode(`: connected\n\n`))
      // Heartbeat every 25s so proxies / browsers keep the connection open.
      const beat = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)) } catch { clearInterval(beat) }
      }, 25_000)
      ;(controller as unknown as { _cleanup?: () => void })._cleanup = () => {
        clearInterval(beat)
        unregister()
      }
    },
    cancel() {
      // Some runtimes invoke cancel; we rely on the cleanup function attached above.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
