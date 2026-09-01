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

  const existing = await db.businessTrip.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Requests with a manager stage must clear it first (see ./manager-approval/route.ts) —
  // HR can't jump ahead of an unresolved manager stage.
  if (existing.requiresManagerApproval && existing.status === 'PENDING') {
    return NextResponse.json({ error: "Waiting on the employee's manager to approve first" }, { status: 409 })
  }
  if (existing.status !== 'PENDING' && existing.status !== 'PENDING_HR_APPROVAL') {
    return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })
  }

  const updated = await db.businessTrip.update({
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
    const title = action === 'approve' ? 'Business trip approved' : 'Business trip rejected'
    const body = `Your business trip to ${existing.destination} was ${action === 'approve' ? 'approved' : 'rejected'}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'BUSINESS_TRIP_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-business-trips')

  return NextResponse.json(updated)
}
