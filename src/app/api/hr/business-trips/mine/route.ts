import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

// Who a business trip request falls back to notifying when the requester's Employee
// record has no manager (or no manager with a login) — same fallback list HR/Admin
// already see the full queue under, at src/app/api/hr/business-trips/route.ts.
const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Self-service business trip: any logged-in user files/views business trips for their
// own Employee record only (resolved via Employee.userId), unlike the HR-only
// src/app/api/hr/business-trips/route.ts which only lists (HR never files on behalf of
// an employee — see plan notes).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ linked: false, employee: null, trips: [] })

  const trips = await db.businessTrip.findMany({
    where: { employeeId: employee.id },
    orderBy: { requestedAt: 'desc' },
    include: {
      managerApprovedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      reimbursements: { orderBy: { createdAt: 'desc' } },
    },
  })

  return NextResponse.json({ linked: true, employee, trips })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { destination, purpose, startDate, endDate } = await req.json()

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, managerId: true, manager: { select: { userId: true } } },
  })
  if (!employee) return NextResponse.json({ error: "Your account isn't linked to an HR employee profile yet. Ask an Admin to link it under Team." }, { status: 400 })

  if (!destination?.trim()) return NextResponse.json({ error: 'Please enter a destination' }, { status: 400 })
  if (!purpose?.trim()) return NextResponse.json({ error: 'Please enter a purpose' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })

  // A manager with an ERP login must clear their stage first; otherwise this skips
  // straight to HR — same fallback idea as LeaveRequest's crew/no-crew branching.
  const managerUserId = employee.manager?.userId ?? null

  const trip = await db.businessTrip.create({
    data: {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      destination: destination.trim(),
      purpose: purpose.trim(),
      startDate: start,
      endDate: end,
      requiresManagerApproval: !!managerUserId,
      status: managerUserId ? 'PENDING' : 'PENDING_HR_APPROVAL',
      requestedById: session.user.id,
      updatedAt: new Date(),
    },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

  if (managerUserId) {
    const title = 'Business trip request needs your approval'
    const body = `${employee.fullName} requested a business trip to ${destination.trim()} (${startDate} to ${endDate}).`
    await db.notification.create({
      data: { userId: managerUserId, type: 'BUSINESS_TRIP_MANAGER_APPROVAL_NEEDED', title, body },
    }).catch(() => {})
    sendPushToUsers(db, [managerUserId], { title, body }).catch(() => {})
  } else {
    const title = 'Business trip request needs your approval'
    const body = `${employee.fullName} requested a business trip to ${destination.trim()} (${startDate} to ${endDate}).`
    const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
    if (hrUsers.length) {
      await db.notification.createMany({
        data: hrUsers.map(u => ({ userId: u.id, type: 'BUSINESS_TRIP_HR_APPROVAL_NEEDED', title, body })),
      }).catch(() => {})
      sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
    }
  }

  emitTenantEvent(session.user.tenantId, 'hr-business-trips')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(trip, { status: 201 })
}
