import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { subscribeTenant, type RealtimeTopic } from '@/lib/realtime-bus'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.tenantId) return new Response('Unauthorized', { status: 401 })
  const tenantId = session.user.tenantId

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (line: string) => {
        try { controller.enqueue(encoder.encode(line)) } catch { /* controller already closed */ }
      }

      send('retry: 3000\n\n')
      send(': connected\n\n')

      const unsubscribe = subscribeTenant(tenantId, (topic: RealtimeTopic) => send(`data: ${topic}\n\n`))
      // Keeps the connection warm through the Caddy proxy and any OS/browser idle-socket
      // timeout during long quiet periods. A ':' comment line never fires EventSource's
      // 'message' event, so it can't be confused with a real topic.
      const heartbeat = setInterval(() => send(':heartbeat\n\n'), 20_000)

      const cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      }
      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
