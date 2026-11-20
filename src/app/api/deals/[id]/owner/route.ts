import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUser } from '@/lib/push'
import { chatRole, roleMatches } from '@/lib/role-utils'
import { setLeadOwner } from '@/lib/whatsapp-lead'
import { isClosedDealStage } from '@/lib/deal-maker'
import { CLOSED_READ_ONLY_MSG } from '@/lib/deal-stage'

// Who owns a deal on the Sales Pipeline board.
//   An OPEN deal with a lead → the lead's owner changes (its chats and all its open deals follow —
//   DB trigger lead_owner_to_open_deals), same as before deals existed.
//   A deal without a lead (a guest's), or a Won / Lost one (ADMIN only) → just this deal.
//   ADMIN: `{ ownerId }` to assign, `{ ownerId: null }` to release. SALES: claim an unowned one only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = chatRole((session?.user as { role?: string })?.role)
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SALES'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { ownerId } = await req.json() as { ownerId?: string | null }
  const db = await getDb(session)
  const deal = await db.deal.findUnique({ where: { id }, select: { id: true, stage: true, ownerId: true, leadId: true, orderId: true, lead: { select: { name: true, ownerId: true } }, customer: { select: { name: true } } } })
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isAdmin = roleMatches(role, ['ADMIN'])
  const closed = isClosedDealStage(deal.stage)
  if (closed && !isAdmin) return NextResponse.json({ error: CLOSED_READ_ONLY_MSG }, { status: 409 })
  const name = deal.lead?.name ?? deal.customer?.name ?? deal.orderId ?? id

  if (!isAdmin) {
    if (ownerId !== session.user.id) return NextResponse.json({ error: 'Sales can only claim a deal for themselves' }, { status: 403 })
    if (deal.ownerId) return NextResponse.json({ error: 'This deal was just taken by another sales rep' }, { status: 409 })
  } else if (ownerId !== null) {
    if (typeof ownerId !== 'string') return NextResponse.json({ error: 'ownerId is required' }, { status: 400 })
    const target = await db.user.findFirst({ where: { id: ownerId, role: 'SALES' }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'Selected user is not a sales rep' }, { status: 400 })
  }

  if (deal.leadId && !closed) {
    const ok = await setLeadOwner(db, deal.leadId, ownerId ?? null, isAdmin ? 'MANUAL' : 'CLAIM', !isAdmin)
    if (!ok) return NextResponse.json({ error: 'This lead was just taken by another sales rep' }, { status: 409 })
    // The trigger moves the lead's open deals; set this one explicitly too (lead owner may not have changed).
    await db.deal.update({ where: { id }, data: { ownerId: ownerId ?? null, ownerAssignedAt: ownerId ? new Date() : null } })
  } else {
    const { count } = await db.deal.updateMany({ where: { id, ...(isAdmin ? {} : { ownerId: null }) }, data: { ownerId: ownerId ?? null, ownerAssignedAt: ownerId ? new Date() : null } })
    if (!count) return NextResponse.json({ error: 'This deal was just taken by another sales rep' }, { status: 409 })
  }

  if (isAdmin && ownerId && ownerId !== deal.ownerId && ownerId !== session.user.id) {
    const title = `Deal assigned to you: ${name}`
    const body = `Assigned by ${session.user.name ?? session.user.email ?? 'Admin'}`
    db.notification.create({ data: { userId: ownerId, type: 'LEAD_ASSIGNED', title, body } }).catch(() => {})
    sendPushToUser(db, ownerId, { title, body, url: '/' }).catch(() => {})
  }
  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown', userRole: role,
    action: 'UPDATE', entity: 'Deal', entityId: id, detail: `Deal owner changed (${name})`,
  }, db).catch(() => {})
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json({ ok: true })
}
