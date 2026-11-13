import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts, TRIP_BOOKING_STATUSES } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, resolveYachtCrewApprovers, countLeaveDays, resolveLeaveWaitingOn, LEAVE_SKIP_MANAGER_ROLES, notifyLeaveReachedHr, parseLeaveType, leaveKind, leaveOffLabel, LEAVE_TYPE_LABEL, usesLeaveBalance, sanitizeLeaveAttachments } from '@/lib/leave-request'

// Who a leave request falls back to notifying when the requester's Employee record has
// no manager (or no manager with a login) — same list HR/Admin already see the full
// queue under, at src/app/api/hr/leave-requests/route.ts.

// Self-service leave request: any logged-in user files/views leave requests for their
// own Employee record only (resolved via Employee.userId), unlike the HR-only
// src/app/api/hr/leave-requests/route.ts which can act on any employee.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, leaveBalance: true, leaveEntitlementPolicy: true, employmentStatus: true, location: { select: { name: true } }, manager: { select: { fullName: true } } },
  })
  if (!employee) return NextResponse.json({ linked: false, employee: null, requests: [] })

  const requests = await db.leaveRequest.findMany({
    where: { employeeId: employee.id },
    orderBy: { requestedAt: 'desc' },
    omit: { attachments: true },
    include: { decidedBy: { select: { id: true, name: true } }, crewApprovedBy: { select: { id: true, name: true } }, captainApprovedBy: { select: { id: true, name: true } }, managerApprovedBy: { select: { id: true, name: true } } },
  })

  // Trip coverage: same crew match as the HR queue (src/app/api/hr/leave-requests/route.ts)
  // — if this employee's Work Location matches a Yacht name, tell them which of that
  // yacht's trips fall inside each requested range, so they can see the same thing HR
  // will see when deciding whether a freelance replacement is needed.
  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts([{ id: employee.id, locationName: employee.location?.name ?? null }], yachts).get(employee.id)

  let tripsByRequestId = new Map<string, { bookingCode: string; destination: string | null; startDate: Date; endDate: Date }[]>()
  if (yachtId && requests.length) {
    const minStart = new Date(Math.min(...requests.map(r => r.startDate.getTime())))
    const maxEnd = new Date(Math.max(...requests.map(r => r.endDate.getTime())))
    const tripBookings = await db.booking.findMany({
      where: {
        yachtId,
        status: { in: [...TRIP_BOOKING_STATUSES] },
        startDate: { lte: maxEnd },
        endDate: { gte: minStart },
      },
      select: { bookingCode: true, destination: true, startDate: true, endDate: true },
    })
    tripsByRequestId = new Map(requests.map(r => [
      r.id,
      tripBookings
        .filter(b => b.startDate <= r.endDate && b.endDate >= r.startDate)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    ]))
  }

  const waitingOn = await resolveLeaveWaitingOn(db, requests.map(r => ({
    id: r.id, status: r.status, requiresCrewApproval: r.requiresCrewApproval, requiresManagerApproval: r.requiresManagerApproval,
    requiresCaptainApproval: r.requiresCaptainApproval, captainApprovedAt: r.captainApprovedAt,
    requiresCdApproval: r.requiresCdApproval, crewApprovedAt: r.crewApprovedAt,
    managerName: employee.manager?.fullName ?? null, yachtId,
  })))

  return NextResponse.json({
    linked: true,
    employee: { ...employee, manager: undefined, isCrew: !!yachtId },
    requests: requests.map(r => ({ ...r, trips: tripsByRequestId.get(r.id) ?? [], waitingOn: waitingOn.get(r.id) ?? null })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { startDate, endDate, reason, needsFreelance, freelanceRecommendations, attachments: rawAttachments, type: rawType } = await req.json()
  const type = parseLeaveType(rawType)
  const label = leaveOffLabel(type)
  // Sick leave must come with the doctor's letter (surat sakit).
  const attachments = type === 'SICK' ? sanitizeLeaveAttachments(rawAttachments) : []
  if (type === 'SICK' && attachments.length === 0) {
    return NextResponse.json({ error: "Please attach the doctor's letter (photo or PDF) for sick leave" }, { status: 400 })
  }

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, leaveBalance: true, userId: true, user: { select: { role: true } }, managerId: true, manager: { select: { userId: true } }, location: { select: { name: true } }, employmentStatus: true },
  })
  if (!employee) return NextResponse.json({ error: "Your account isn't linked to an HR employee profile yet. Ask an Admin to link it under Team." }, { status: 400 })

  // Freelance staff aren't on the leave-accrual system at all (no leaveBalance is ever
  // set up for them) — block the request outright instead of silently letting an
  // uncapped one (leaveBalance null skips the over-request check below) through.
  if (employee.employmentStatus === 'Freelance') {
    return NextResponse.json({ error: 'Freelance staff are not eligible for leave requests.' }, { status: 400 })
  }

  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })

  // Crew (Work Location matches a Yacht name — same match as payroll's Uang Layar) goes
  // through their yacht's Captain then Cruise Director first, then HR for final sign-off;
  // everyone else (and crew whose yacht has nobody in either role yet) goes to
  // manager/HR. See resolveYachtCrewApprovers. Also determines whether weekends
  // count toward this request's day total — see countLeaveDays.
  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts([{ id: employee.id, locationName: employee.location?.name ?? null }], yachts).get(employee.id)
  // Crew stage = Captain → Cruise Director (whichever the yacht has; someone never
  // approves their own request, so a Captain/CD filing their own leave skips that step).
  const yachtApprovers = yachtId ? await resolveYachtCrewApprovers(db, yachtId) : { captain: null, cd: null }
  const captainApprover = yachtApprovers.captain && yachtApprovers.captain.id !== employee.userId ? yachtApprovers.captain : null
  const cdApprover = yachtApprovers.cd && yachtApprovers.cd.id !== employee.userId ? yachtApprovers.cd : null
  const crewApprover = captainApprover ?? cdApprover

  const days = countLeaveDays(start, end, !!yachtId)

  // Shore staff → the employee's manager approves first if they have an ERP login (and
  // isn't the employee themself), then HR — same as BusinessTrip. No manager login, or a
  // role in LEAVE_SKIP_MANAGER_ROLES (Sales team) → straight to HR.
  const skipManager = !!employee.user?.role && LEAVE_SKIP_MANAGER_ROLES.includes(employee.user.role)
  // Crew (yachtId set) never go through the manager — even a Captain on a yacht with no
  // CD (nobody left to approve on board) goes straight to HR.
  const managerUserId = !yachtId && !skipManager && employee.manager?.userId && employee.manager.userId !== employee.userId
    ? employee.manager.userId : null

  // Block over-requesting past what's left — leaveBalance can be null (no policy tracked
  // for this employee yet), in which case there's nothing to cap against. WFH / sick leave never
  // touches the balance, so it's never capped.
  if (usesLeaveBalance(type) && employee.leaveBalance != null && days > employee.leaveBalance) {
    return NextResponse.json({ error: `You only have ${employee.leaveBalance} day${employee.leaveBalance !== 1 ? 's' : ''} of leave remaining` }, { status: 400 })
  }

  const leaveRequest = await db.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      type,
      attachments,
      needsFreelance: type !== 'WFH' && !!needsFreelance,
      freelanceRecommendations: (type !== 'WFH' && needsFreelance ? sanitizeFreelanceRecommendations(freelanceRecommendations) : []) as unknown as Prisma.InputJsonValue,
      requiresCrewApproval: !!crewApprover,
      requiresCaptainApproval: !!captainApprover,
      requiresCdApproval: !!cdApprover,
      requiresManagerApproval: !!managerUserId,
      requestedById: session.user.id,
    },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

  if (crewApprover) {
    // Crew stage — only the first approver (Captain, or the CD if there's no Captain) is
    // notified; the CD/HR hear about it as each stage clears (see the crew-approval route).
    const title = `Crew ${leaveKind(type)} request needs your approval`
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} ${label} (${startDate} to ${endDate}).`
    await db.notification.create({
      data: { userId: crewApprover.id, type: 'LEAVE_APPROVAL_NEEDED', title, body },
    }).catch(() => {})
    sendPushToUsers(db, [crewApprover.id], { title, body }).catch(() => {})
  } else {
    // Same routing as the HR-filed flow: notify the employee's manager if they have a
    // login, otherwise every HR/Admin/Super Admin so it never sits unseen.
    const title = `${LEAVE_TYPE_LABEL[type]} request needs your approval`
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} ${label} (${startDate} to ${endDate}).`
    if (managerUserId) {
      await db.notification.create({
        data: { userId: managerUserId, type: 'LEAVE_APPROVAL_NEEDED', title, body },
      }).catch(() => {})
      sendPushToUsers(db, [managerUserId], { title, body }).catch(() => {})
    } else {
      // Straight to HR — crew also send the FYI to Purchasing/Accounting (see
      // notifyLeaveReachedHr), same as when a crew request clears the on-board steps.
      await notifyLeaveReachedHr(db, {
        employeeName: employee.fullName, type, days, startDate: start, endDate: end, approvedByLabel: null, isCrew: !!yachtId,
      })
    }
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(leaveRequest, { status: 201 })
}
