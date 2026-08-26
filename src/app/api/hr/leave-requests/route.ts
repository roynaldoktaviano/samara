import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const requests = await db.leaveRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true, managerId: true } },
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, startDate, endDate, reason } = await req.json()

  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'Please select a start and end date' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, managerId: true, manager: { select: { userId: true } } },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const leaveRequest = await db.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      startDate: start,
      endDate: end,
      days,
      reason: reason?.trim() || null,
      requestedById: session.user.id,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  })

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

  return NextResponse.json(leaveRequest, { status: 201 })
}
