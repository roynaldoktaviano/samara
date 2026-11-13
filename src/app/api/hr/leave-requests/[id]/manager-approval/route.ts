import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyLeaveReachedHr, leaveKind, LEAVE_TYPE_LABEL } from '@/lib/leave-request'

// Stage-1 approval for a non-crew LeaveRequest (requiresManagerApproval) — distinct from
// the HR final decision in ../route.ts. Identity-based: must be the employee's current
// manager (Employee.managerId → manager.userId), any role. Mirrors
// src/app/api/hr/business-trips/[id]/manager-approval/route.ts and ../crew-approval.
// Approving moves it to PENDING_HR_APPROVAL (HR still signs off, debits leaveBalance and
// syncs Attendance); rejecting is final.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { action, decisionNote } = await req.json() as { action?: 'approve' | 'reject'; decisionNote?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true, manager: { select: { userId: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.requiresManagerApproval) return NextResponse.json({ error: "This request doesn't need manager approval" }, { status: 409 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already moved past the manager approval stage' }, { status: 409 })
  if (existing.employee.manager?.userId !== session.user.id) return NextResponse.json({ error: "This leave request isn't yours to approve" }, { status: 403 })

  const note = decisionNote?.trim() || null
  const now = new Date()
  const updated = await db.leaveRequest.update({
    where: { id },
    data: action === 'approve'
      ? { status: 'PENDING_HR_APPROVAL', managerApprovedById: session.user.id, managerApprovedAt: now, managerDecisionNote: note }
      : {
          status: 'REJECTED',
          managerApprovedById: session.user.id, managerApprovedAt: now, managerDecisionNote: note,
          decidedById: session.user.id, decidedAt: now, decisionNote: note,
        },
  })

  const kind = leaveKind(existing.type)
  if (action === 'approve') {
    await notifyLeaveReachedHr(db, {
      employeeName: existing.employee.fullName, type: existing.type, days: existing.days,
      startDate: existing.startDate, endDate: existing.endDate, approvedByLabel: 'their manager', isCrew: false,
    })
  } else if (existing.employee.userId) {
    const title = `${LEAVE_TYPE_LABEL[existing.type]} request rejected`
    const body = `Your ${kind} request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was rejected by your manager.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
