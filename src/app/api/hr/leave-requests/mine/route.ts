import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

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
    select: { id: true, fullName: true, leaveBalance: true, leaveEntitlementPolicy: true },
  })
  if (!employee) return NextResponse.json({ linked: false, employee: null, requests: [] })

  const requests = await db.leaveRequest.findMany({
    where: { employeeId: employee.id },
    orderBy: { requestedAt: 'desc' },
    include: { decidedBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json({ linked: true, employee, requests })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { startDate, endDate, reason } = await req.json()

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, managerId: true, manager: { select: { userId: true } } },
  })
  if (!employee) return NextResponse.json({ error: "Your account isn't linked to an HR employee profile yet. Ask an Admin to link it under Team." }, { status: 400 })

  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  const leaveRequest = await db.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      requestedById: session.user.id,
    },
    include: { decidedBy: { select: { id: true, name: true } } },
  })

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

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')

  return NextResponse.json(leaveRequest, { status: 201 })
}
