import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUser } from '@/lib/push'
import { claimWhatsappConversation } from '@/lib/whatsapp-distribution'

// Changes who holds a WhatsApp chat — distribution only ever assigns once (on the first
// inbound message), so this is how a chat moves on when a rep leaves, is on leave, or the
// chat came in while that brand's pool was empty.
//   ADMIN: `{ assignedToId: <SALES user id> }` to reassign, `{ assignedToId: null }` to
//          release it back to unassigned (claimable by any SALES rep).
//   SALES: `{ assignedToId: <own id> }` only, and only while the chat is unassigned (claim).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { assignedToId } = await req.json() as { assignedToId?: string | null }
  const db = await getDb(session)

  const conversation = await db.whatsappConversation.findUnique({ where: { id }, select: { id: true, phone: true, contactName: true, assignedToId: true } })
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (role === 'SALES') {
    if (assignedToId !== session.user.id) return NextResponse.json({ error: 'Sales can only claim a chat for themselves' }, { status: 403 })
    if (!(await claimWhatsappConversation(db, id, session.user.id))) {
      return NextResponse.json({ error: 'This chat is already handled by another sales rep' }, { status: 409 })
    }
    emitTenantEvent(session.user.tenantId, 'chat')
    return NextResponse.json({ ok: true })
  }

  if (assignedToId !== null) {
    if (typeof assignedToId !== 'string') return NextResponse.json({ error: 'assignedToId is required' }, { status: 400 })
    const target = await db.user.findFirst({ where: { id: assignedToId, role: 'SALES' }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'Selected user is not a sales rep' }, { status: 400 })
  }

  await db.whatsappConversation.update({ where: { id }, data: { assignedToId } })
  emitTenantEvent(session.user.tenantId, 'chat')

  if (assignedToId && assignedToId !== conversation.assignedToId && assignedToId !== session.user.id) {
    const title = `WhatsApp chat assigned to you: ${conversation.contactName || conversation.phone}`
    const body = `Reassigned by ${session.user.name ?? session.user.email ?? 'Admin'}`
    db.notification.create({ data: { userId: assignedToId, type: 'WHATSAPP_MESSAGE', title, body } }).catch(() => {})
    sendPushToUser(db, assignedToId, { title, body, url: '/' }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
