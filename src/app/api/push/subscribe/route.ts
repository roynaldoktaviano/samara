import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// Called by the client right after navigator.serviceWorker.ready.pushManager.subscribe()
// succeeds. `endpoint` is globally unique per browser+site install, so upserting on it
// naturally re-points a subscription to whoever is logged in now (e.g. a shared device).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { endpoint, keys, userAgent } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string }
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
    create: { id: crypto.randomUUID(), userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { endpoint } = body as { endpoint?: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

  await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
