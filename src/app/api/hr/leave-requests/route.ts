import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts, TRIP_BOOKING_STATUSES } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, resolveYachtCrewApprovers, countLeaveDays, resolveLeaveWaitingOn, LEAVE_SKIP_MANAGER_ROLES, notifyLeaveReachedHr } from '@/lib/leave-request'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const requests = await db.leaveRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true, managerId: true, manager: { select: { fullName: true } }, location: { select: { name: true } } } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      crewApprovedBy: { select: { id: true, name: true } },
      captainApprovedBy: { select: { id: true, name: true } },
      managerApprovedBy: { select: { id: true, name: true } },
    },
  })

  // Trip coverage: for crew (employee's Work Location name matches a Yacht name — same
  // match used for Uang Layar in payroll, see matchEmployeesToYachts), tell HR which of
  // that yacht's trips fall inside the requested leave range, so they know how many
  // trips need a freelance replacement while covering the request.
  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtIdByEmployeeId = matchEmployeesToYachts(
    requests.map(r => ({ id: r.employee.id, locationName: r.employee.location?.name ?? null })),
    yachts,
  )
  const neededYachtIds = [...new Set(yachtIdByEmployeeId.values())]
  const crewRequests = requests.filter(r => yachtIdByEmployeeId.has(r.employee.id))

  const tripsByRequestId = new Map<string, { bookingCode: string; destination: string | null; startDate: Date; endDate: Date }[]>()
  if (crewRequests.length && neededYachtIds.length) {
    const minStart = new Date(Math.min(...crewRequests.map(r => r.startDate.getTime())))
    const maxEnd = new Date(Math.max(...crewRequests.map(r => r.endDate.getTime())))
    const tripBookings = await db.booking.findMany({
      where: {
        yachtId: { in: neededYachtIds },
        status: { in: [...TRIP_BOOKING_STATUSES] },
        startDate: { lte: maxEnd },
        endDate: { gte: minStart },
      },
      select: { yachtId: true, bookingCode: true, destination: true, startDate: true, endDate: true },
    })
    for (const r of crewRequests) {
      const yachtId = yachtIdByEmployeeId.get(r.employee.id)!
      const overlapping = tripBookings
        .filter(b => b.yachtId === yachtId && b.startDate <= r.endDate && b.endDate >= r.startDate)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        .map(b => ({ bookingCode: b.bookingCode, destination: b.destination, startDate: b.startDate, endDate: b.endDate }))
      tripsByRequestId.set(r.id, overlapping)
    }
  }

  const waitingOn = await resolveLeaveWaitingOn(db, requests.map(r => ({
    id: r.id, status: r.status, requiresCrewApproval: r.requiresCrewApproval, requiresManagerApproval: r.requiresManagerApproval,
    requiresCaptainApproval: r.requiresCaptainApproval, captainApprovedAt: r.captainApprovedAt,
    requiresCdApproval: r.requiresCdApproval, crewApprovedAt: r.crewApprovedAt,
    managerName: r.employee.manager?.fullName ?? null, yachtId: yachtIdByEmployeeId.get(r.employee.id),
  })))

  return NextResponse.json(requests.map(r => ({ ...r, trips: tripsByRequestId.get(r.id) ?? [], waitingOn: waitingOn.get(r.id) ?? null })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, startDate, endDate, reason, needsFreelance, freelanceRecommendations, type: rawType } = await req.json()
  const type: 'LEAVE' | 'WFH' = rawType === 'WFH' ? 'WFH' : 'LEAVE'
  const label = type === 'WFH' ? 'WFH' : 'off'

  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, leaveBalance: true, userId: true, user: { select: { role: true } }, managerId: true, manager: { select: { userId: true } }, location: { select: { name: true } }, employmentStatus: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Freelance staff aren't on the leave-accrual system at all — block outright rather
  // than let HR file one that has no leaveBalance to cap against.
  if (employee.employmentStatus === 'Freelance') {
    return NextResponse.json({ error: `${employee.fullName} is Freelance and not eligible for leave requests.` }, { status: 400 })
  }

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
  // for this employee yet), in which case there's nothing to cap against. WFH never
  // touches the balance, so it's never capped.
  if (type === 'LEAVE' && employee.leaveBalance != null && days > employee.leaveBalance) {
    return NextResponse.json({ error: `${employee.fullName} only has ${employee.leaveBalance} day${employee.leaveBalance !== 1 ? 's' : ''} of leave remaining` }, { status: 400 })
  }

  const leaveRequest = await db.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      type,
      needsFreelance: type === 'LEAVE' && !!needsFreelance,
      freelanceRecommendations: (type === 'LEAVE' && needsFreelance ? sanitizeFreelanceRecommendations(freelanceRecommendations) : []) as unknown as Prisma.InputJsonValue,
      requiresCrewApproval: !!crewApprover,
      requiresCaptainApproval: !!captainApprover,
      requiresCdApproval: !!cdApprover,
      requiresManagerApproval: !!managerUserId,
      requestedById: session.user.id,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  })

  if (crewApprover) {
    // Crew stage — only the first approver (Captain, or the CD if there's no Captain) is
    // notified; the CD/HR hear about it as each stage clears (see the crew-approval route).
    const title = type === 'WFH' ? 'Crew WFH request needs your approval' : 'Crew leave request needs your approval'
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} ${label} (${startDate} to ${endDate}).`
    await db.notification.create({
      data: { userId: crewApprover.id, type: 'LEAVE_APPROVAL_NEEDED', title, body },
    }).catch(() => {})
    sendPushToUsers(db, [crewApprover.id], { title, body }).catch(() => {})
  } else {
    // Route to the employee's manager if that manager has an ERP login; otherwise fall
    // back to every HR/Admin/Super Admin so it never sits unseen — same pattern as
    // PurchaseRequest's manager-approval routing.
    const title = type === 'WFH' ? 'WFH request needs your approval' : 'Leave request needs your approval'
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
