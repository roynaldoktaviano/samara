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

  const existing = await db.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, leaveBalance: true, userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })

  const updated = await db.leaveRequest.update({
    where: { id },
    data: {
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
      decidedById: session.user.id,
      decidedAt: new Date(),
      decisionNote: decisionNote?.trim() || null,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })

  if (action === 'approve') {
    await db.employee.update({
      where: { id: existing.employeeId },
      data: { leaveBalance: (existing.employee.leaveBalance ?? 0) - existing.days },
    })

    // Auto-reflect the approved leave in Attendance Recap — one CUTI row per day in
    // range, so HR never has to manually mirror an approved request into the grid.
    const dates: Date[] = []
    for (const d = new Date(existing.startDate); d <= existing.endDate; d.setUTCDate(d.getUTCDate() + 1)) dates.push(new Date(d))
    await Promise.all(dates.map(date => db.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: existing.employeeId, date } },
      create: { id: crypto.randomUUID(), employeeId: existing.employeeId, date, status: 'CUTI', leaveRequestId: existing.id, setById: session.user.id },
      update: { status: 'CUTI', leaveRequestId: existing.id, setById: session.user.id },
    })))
  }

  if (existing.employee.userId) {
    const title = action === 'approve' ? 'Leave request approved' : 'Leave request rejected'
    const body = `Your leave request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was ${action === 'approve' ? 'approved' : 'rejected'}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')

  return NextResponse.json(updated)
}
