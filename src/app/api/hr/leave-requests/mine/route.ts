import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts, TRIP_BOOKING_STATUSES } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, resolveCrewLeaveApprover } from '@/lib/leave-request'

// Who a leave request falls back to notifying when the requester's Employee record has
// no manager (or no manager with a login) — same list HR/Admin already see the full
// queue under, at src/app/api/hr/leave-requests/route.ts.
const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Self-service leave request: any logged-in user files/views leave requests for their
// own Employee record only (resolved via Employee.userId), unlike the HR-only
// src/app/api/hr/leave-requests/route.ts which can act on any employee.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, leaveBalance: true, leaveEntitlementPolicy: true, location: { select: { name: true } } },
  })
  if (!employee) return NextResponse.json({ linked: false, employee: null, requests: [] })

  const requests = await db.leaveRequest.findMany({
    where: { employeeId: employee.id },
    orderBy: { requestedAt: 'desc' },
    include: { decidedBy: { select: { id: true, name: true } }, crewApprovedBy: { select: { id: true, name: true } } },
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

  return NextResponse.json({
    linked: true,
    employee,
    requests: requests.map(r => ({ ...r, trips: tripsByRequestId.get(r.id) ?? [] })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { startDate, endDate, reason, needsFreelance, freelanceRecommendations } = await req.json()

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, leaveBalance: true, managerId: true, manager: { select: { userId: true } }, location: { select: { name: true } } },
  })
  if (!employee) return NextResponse.json({ error: "Your account isn't linked to an HR employee profile yet. Ask an Admin to link it under Team." }, { status: 400 })

  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  // Block over-requesting past what's left — leaveBalance can be null (no policy tracked
  // for this employee yet), in which case there's nothing to cap against.
  if (employee.leaveBalance != null && days > employee.leaveBalance) {
    return NextResponse.json({ error: `You only have ${employee.leaveBalance} day${employee.leaveBalance !== 1 ? 's' : ''} of leave remaining` }, { status: 400 })
  }

  // Crew (Work Location matches a Yacht name — same match as payroll's Uang Layar) goes
  // through their yacht's Cruise Director/Captain first, then HR for final sign-off;
  // everyone else (and crew whose yacht has nobody in either role yet) goes straight to
  // HR/manager as before. See resolveCrewLeaveApprover.
  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts([{ id: employee.id, locationName: employee.location?.name ?? null }], yachts).get(employee.id)
  const crewApprover = yachtId ? await resolveCrewLeaveApprover(db, yachtId) : null

  const leaveRequest = await db.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      needsFreelance: !!needsFreelance,
      freelanceRecommendations: (needsFreelance ? sanitizeFreelanceRecommendations(freelanceRecommendations) : []) as unknown as Prisma.InputJsonValue,
      requiresCrewApproval: !!crewApprover,
      requestedById: session.user.id,
    },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

  if (crewApprover) {
    // Crew stage — only the resolved Cruise Director/Captain is notified; HR only hears
    // about it once that stage clears (see the crew-approval route).
    const title = 'Crew leave request needs your approval'
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} off (${startDate} to ${endDate}).`
    await db.notification.create({
      data: { userId: crewApprover.id, type: 'LEAVE_APPROVAL_NEEDED', title, body },
    }).catch(() => {})
    sendPushToUsers(db, [crewApprover.id], { title, body }).catch(() => {})
  } else {
    // Same routing as the HR-filed flow: notify the employee's manager if they have a
    // login, otherwise every HR/Admin/Super Admin so it never sits unseen.
    const title = 'Leave request needs your approval'
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} off (${startDate} to ${endDate}).`
    if (employee.manager?.userId) {
      await db.notification.create({
        data: { userId: employee.manager.userId, type: 'LEAVE_APPROVAL_NEEDED', title, body },
      }).catch(() => {})
      sendPushToUsers(db, [employee.manager.userId], { title, body }).catch(() => {})
    } else {
      const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
      if (hrUsers.length) {
        await db.notification.createMany({
          data: hrUsers.map(u => ({ userId: u.id, type: 'LEAVE_APPROVAL_NEEDED', title, body })),
        }).catch(() => {})
        sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
      }
    }
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(leaveRequest, { status: 201 })
}
