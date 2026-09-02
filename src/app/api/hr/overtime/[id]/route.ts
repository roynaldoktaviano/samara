import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { action, decisionNote } = await req.json() as { action?: 'approve' | 'reject'; decisionNote?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.overtimeRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })

  const updated = await db.overtimeRequest.update({
    where: { id },
    data: {
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
      decidedById: session.user.id,
      decidedAt: new Date(),
      decisionNote: decisionNote?.trim() || null,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, userId: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })

  if (existing.employee.userId) {
    const title = action === 'approve' ? 'Overtime request approved' : 'Overtime request rejected'
    const body = `Your overtime claim on ${existing.date.toISOString().split('T')[0]} was ${action === 'approve' ? 'approved' : 'rejected'}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'OVERTIME_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-overtime')

  return NextResponse.json(updated)
}
