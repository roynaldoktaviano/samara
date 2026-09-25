import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUser } from '@/lib/push'
import { roleMatches } from '@/lib/role-utils'
import { setLeadOwner } from '@/lib/whatsapp-lead'

// Changes who owns a Lead (and, with it, its WhatsApp chats — see setLeadOwner).
//   ADMIN: `{ ownerId: <SALES user id> }` to assign, `{ ownerId: null }` to release.
//   SALES: `{ ownerId: <own id> }` only, and only while the lead has no owner (claim).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SALES'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { ownerId } = await req.json() as { ownerId?: string | null }
  const db = await getDb(session)
  const lead = await db.lead.findUnique({ where: { id }, select: { name: true, ownerId: true } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!roleMatches(role, ['ADMIN'])) {
    if (ownerId !== session.user.id) return NextResponse.json({ error: 'Sales can only claim a lead for themselves' }, { status: 403 })
    if (!(await setLeadOwner(db, id, session.user.id, 'CLAIM', true))) {
      return NextResponse.json({ error: 'This lead was just taken by another sales rep' }, { status: 409 })
    }
  } else {
    if (ownerId !== null) {
      if (typeof ownerId !== 'string') return NextResponse.json({ error: 'ownerId is required' }, { status: 400 })
      const target = await db.user.findFirst({ where: { id: ownerId, role: 'SALES' }, select: { id: true } })
      if (!target) return NextResponse.json({ error: 'Selected user is not a sales rep' }, { status: 400 })
    }
    await setLeadOwner(db, id, ownerId, 'MANUAL')
    if (ownerId && ownerId !== lead.ownerId && ownerId !== session.user.id) {
      const title = `Lead assigned to you: ${lead.name}`
      const body = `Assigned by ${session.user.name ?? session.user.email ?? 'Admin'}`
      db.notification.create({ data: { userId: ownerId, type: 'LEAD_ASSIGNED', title, body } }).catch(() => {})
      sendPushToUser(db, ownerId, { title, body, url: '/' }).catch(() => {})
    }
  }

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'UPDATE', entity: 'Lead', entityId: id,
    detail: `Lead owner changed (${lead.name})`,
  }, db).catch(() => {})
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json({ ok: true })
}
