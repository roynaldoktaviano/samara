import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { LEAVE_TYPE_LABEL, leaveKind, parseLeaveType, usesLeaveBalance, approveLeaveRequest, type LeaveType } from '@/lib/leave-request'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { action, decisionNote, type: rawNewType } = await req.json() as { action?: 'approve' | 'reject' | 'convert'; decisionNote?: string; type?: string }

  // HR re-classifies a still-undecided request (e.g. a "leave" whose reason is really
  // WFH). Nothing has touched leaveBalance or Attendance Recap yet while it's pending —
  // both only happen on final approve — so flipping the type is all that's needed; the
  // day count doesn't depend on type (countLeaveDays). Freelance fields are LEAVE-only,
  // same as on create.
  if (action === 'convert') {
    if (rawNewType !== 'LEAVE' && rawNewType !== 'WFH' && rawNewType !== 'SICK') return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    const newType: LeaveType = parseLeaveType(rawNewType)
    const current = await db.leaveRequest.findUnique({ where: { id }, select: { status: true, type: true, employee: { select: { userId: true } } } })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (current.status !== 'PENDING' && current.status !== 'PENDING_HR_APPROVAL') {
      return NextResponse.json({ error: 'Only pending requests can be converted' }, { status: 409 })
    }
    if (current.type === newType) return NextResponse.json({ ok: true })
    await db.leaveRequest.update({
      where: { id },
      data: { type: newType, ...(newType === 'WFH' ? { needsFreelance: false, freelanceRecommendations: [] } : {}) },
    })
    if (current.employee.userId) {
      const title = `${LEAVE_TYPE_LABEL[current.type]} request changed to ${LEAVE_TYPE_LABEL[newType]}`
      const body = usesLeaveBalance(newType)
        ? `HR changed your ${leaveKind(current.type)} request to annual leave — it will use your leave balance once approved.`
        : `HR changed your ${leaveKind(current.type)} request to ${newType === 'WFH' ? 'Work From Home' : 'sick leave'} — it will not use your leave balance.`
      await db.notification.create({ data: { userId: current.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
      sendPushToUsers(db, [current.employee.userId], { title, body }).catch(() => {})
    }
    emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
    return NextResponse.json({ ok: true })
  }

  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  // Parallel approval (see src/lib/leave-request.ts): HR can decide at any point while the
  // request is pending — no waiting on the Captain/CD/manager, and HR's decision overrides
  // a supervisor's reject. Approve → APPROVED + balance + Attendance (approveLeaveRequest).
  const existing = await db.leaveRequest.findUnique({
    where: { id },
    omit: { attachments: true },
    include: { employee: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING' && existing.status !== 'PENDING_HR_APPROVAL') {
    return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })
  }
  const note = decisionNote?.trim() || null

  if (action === 'approve') {
    const ok = await approveLeaveRequest(db, { id, approverUserId: session.user.id, note, approvedByLabel: 'HR', byHr: true })
    if (!ok) return NextResponse.json({ error: 'This request was already decided — refresh and try again' }, { status: 409 })
  } else {
    const res = await db.leaveRequest.updateMany({
      where: { id, status: { in: ['PENDING', 'PENDING_HR_APPROVAL'] } },
      data: { status: 'REJECTED', decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
    })
    if (res.count === 0) return NextResponse.json({ error: 'This request was already decided — refresh and try again' }, { status: 409 })
    if (existing.employee.userId) {
      const title = `${LEAVE_TYPE_LABEL[existing.type]} request rejected`
      const body = `Your ${leaveKind(existing.type)} request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was rejected by HR.`
      await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
      sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
    }
  }

  const updated = await db.leaveRequest.findUnique({
    where: { id },
    omit: { attachments: true },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
