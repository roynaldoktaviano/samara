import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { clearViewing, markViewing } from '@/lib/chat-presence'

// Heartbeat from an open, visible WhatsApp thread (see src/lib/chat-presence.ts). Only ever
// affects the caller's own notifications, so no conversation access check is needed.
async function caller() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !session.user.tenantId || !['ADMIN', 'SALES'].includes(role)) return null
  return { userId: session.user.id, tenantId: session.user.tenantId }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await caller()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  markViewing(me.tenantId, me.userId, (await params).id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await caller()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  clearViewing(me.tenantId, me.userId, (await params).id)
  return NextResponse.json({ ok: true })
}
