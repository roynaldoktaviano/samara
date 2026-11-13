import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { LEAVE_TYPE_LABEL, leaveKind, parseLeaveType, usesLeaveBalance, type LeaveType } from '@/lib/leave-request'

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
    const current = await db.leaveRequest.findUnique({ where: { id }, select: { status: true, type: true, attachments: true, employee: { select: { userId: true } } } })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (current.status !== 'PENDING' && current.status !== 'PENDING_HR_APPROVAL') {
      return NextResponse.json({ error: 'Only pending requests can be converted' }, { status: 409 })
    }
    if (current.type === newType) return NextResponse.json({ ok: true })
    // Sick leave only stands with a doctor's letter on file.
    if (newType === 'SICK' && current.attachments.length === 0) {
      return NextResponse.json({ error: "No doctor's letter attached — sick leave needs one" }, { status: 400 })
    }
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

  const existing = await db.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, leaveBalance: true, userId: true, location: { select: { name: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Crew requests must clear the Cruise Director/Captain stage first (see
  // ./crew-approval/route.ts) — HR can't jump ahead of an unresolved crew stage.
  if (existing.requiresCrewApproval && existing.status === 'PENDING') {
    return NextResponse.json({ error: 'Waiting on the Cruise Director/Captain to approve first' }, { status: 409 })
  }
  if (existing.requiresManagerApproval && existing.status === 'PENDING') {
    return NextResponse.json({ error: "Waiting on the employee's manager to approve first" }, { status: 409 })
  }
  if (existing.status !== 'PENDING' && existing.status !== 'PENDING_HR_APPROVAL') {
    return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })
  }

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
    // Only annual leave draws down the balance — WFH isn't time off and sick leave is separate.
    if (usesLeaveBalance(existing.type)) {
      await db.employee.update({
        where: { id: existing.employeeId },
        data: { leaveBalance: (existing.employee.leaveBalance ?? 0) - existing.days },
      })
    }

    // Auto-reflect the approved leave in Attendance Recap — one CUTI row per day in
    // range, so HR never has to manually mirror an approved request into the grid. Office
    // staff skip weekend dates here too (they were never working days, see the days
    // count in countLeaveDays), leaving those cells as the normal "not a working day"
    // placeholder instead of a leave dot; crew get every day since they always work.
    const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
    const isCrew = matchEmployeesToYachts(
      [{ id: existing.employee.id, locationName: existing.employee.location?.name ?? null }],
      yachts,
    ).has(existing.employee.id)
    const dates: Date[] = []
    for (const d = new Date(existing.startDate); d <= existing.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      if (isCrew || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) dates.push(new Date(d))
    }
    const attendanceStatus = existing.type === 'WFH' ? 'WFH' : existing.type === 'SICK' ? 'SAKIT' : 'CUTI'
    await Promise.all(dates.map(date => db.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: existing.employeeId, date } },
      create: { id: crypto.randomUUID(), employeeId: existing.employeeId, date, status: attendanceStatus, leaveRequestId: existing.id, setById: session.user.id },
      update: { status: attendanceStatus, leaveRequestId: existing.id, setById: session.user.id },
    })))
  }

  if (existing.employee.userId) {
    const title = `${LEAVE_TYPE_LABEL[existing.type]} request ${action === 'approve' ? 'approved' : 'rejected'}`
    const body = `Your ${leaveKind(existing.type)} request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was ${action === 'approve' ? 'approved' : 'rejected'}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')

  return NextResponse.json(updated)
}
