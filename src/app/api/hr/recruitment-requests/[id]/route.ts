import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { RECRUITMENT_REQUEST_INCLUDE } from '@/lib/hr/recruitment'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

type Action = 'approve' | 'reject' | 'close' | 'reopen'

// HR decides a request (approve/reject — single stage, no manager step), then closes it
// once recruiting is done; reopen puts a closed request back to APPROVED.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { action, decisionNote } = await req.json() as { action?: Action; decisionNote?: string }

  const existing = await db.recruitmentRequest.findUnique({ where: { id }, include: { role: { select: { title: true } } } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let data
  if (action === 'approve' || action === 'reject') {
    if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })
    data = {
      status: action === 'approve' ? 'APPROVED' as const : 'REJECTED' as const,
      decidedById: session.user.id,
      decidedAt: new Date(),
      decisionNote: decisionNote?.trim() || null,
    }
  } else if (action === 'close') {
    if (existing.status !== 'APPROVED') return NextResponse.json({ error: 'Only approved requests can be closed' }, { status: 409 })
    data = { status: 'CLOSED' as const, closedAt: new Date() }
  } else if (action === 'reopen') {
    if (existing.status !== 'CLOSED') return NextResponse.json({ error: 'Only closed requests can be reopened' }, { status: 409 })
    data = { status: 'APPROVED' as const, closedAt: null }
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await db.recruitmentRequest.update({ where: { id }, data, include: RECRUITMENT_REQUEST_INCLUDE })

  if (action === 'approve' || action === 'reject') {
    const title = action === 'approve' ? 'Recruitment request approved' : 'Recruitment request rejected'
    const body = `Your request to hire ${existing.headcount}× ${existing.role.title} was ${action === 'approve' ? 'approved' : 'rejected'} by HR.`
    await db.notification.create({ data: { userId: existing.requestedById, type: 'RECRUITMENT_REQUEST_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.requestedById], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json(updated)
}
