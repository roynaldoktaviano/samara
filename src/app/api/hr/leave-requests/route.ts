import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts, TRIP_BOOKING_STATUSES } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, resolveCrewLeaveApprover } from '@/lib/leave-request'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const requests = await db.leaveRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true, managerId: true, location: { select: { name: true } } } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      crewApprovedBy: { select: { id: true, name: true } },
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

  return NextResponse.json(requests.map(r => ({ ...r, trips: tripsByRequestId.get(r.id) ?? [] })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, startDate, endDate, reason, needsFreelance, freelanceRecommendations } = await req.json()

  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, leaveBalance: true, managerId: true, manager: { select: { userId: true } }, location: { select: { name: true } } },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Block over-requesting past what's left — leaveBalance can be null (no policy tracked
  // for this employee yet), in which case there's nothing to cap against.
  if (employee.leaveBalance != null && days > employee.leaveBalance) {
    return NextResponse.json({ error: `${employee.fullName} only has ${employee.leaveBalance} day${employee.leaveBalance !== 1 ? 's' : ''} of leave remaining` }, { status: 400 })
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
      employeeId,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      needsFreelance: !!needsFreelance,
      freelanceRecommendations: (needsFreelance ? sanitizeFreelanceRecommendations(freelanceRecommendations) : []) as unknown as Prisma.InputJsonValue,
      requiresCrewApproval: !!crewApprover,
      requestedById: session.user.id,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
    },
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
    // Route to the employee's manager if that manager has an ERP login; otherwise fall
    // back to every HR/Admin/Super Admin so it never sits unseen — same pattern as
    // PurchaseRequest's manager-approval routing.
    const title = 'Leave request needs your approval'
    const body = `${employee.fullName} requested ${days} day${days !== 1 ? 's' : ''} off (${startDate} to ${endDate}).`
    if (employee.manager?.userId) {
      await db.notification.create({
        data: { userId: employee.manager.userId, type: 'LEAVE_APPROVAL_NEEDED', title, body },
      }).catch(() => {})
      sendPushToUsers(db, [employee.manager.userId], { title, body }).catch(() => {})
    } else {
      const hrUsers = await db.user.findMany({ where: { role: { in: ALLOWED as never[] } }, select: { id: true } })
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
