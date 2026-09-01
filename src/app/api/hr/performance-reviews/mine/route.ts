import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Self-service side for any manager (identity-based via Employee.managerId → their own
// userId, not role-gated — a manager can hold any Role) to see their direct reports and
// request a performance review for one of them. Mirrors src/app/api/hr/business-trips/mine/route.ts.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const me = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, directReports: { select: { id: true, fullName: true, employeeNumber: true, department: true, employmentStatus: true } } },
  })
  if (!me || me.directReports.length === 0) return NextResponse.json({ directReports: [], requests: [] })

  const requests = await db.performanceReview.findMany({
    where: { employeeId: { in: me.directReports.map(e => e.id) } },
    orderBy: { createdAt: 'desc' },
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } },
  })

  return NextResponse.json({ directReports: me.directReports, requests })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, requestNote } = await req.json() as { employeeId?: string; requestNote?: string }
  if (!employeeId) return NextResponse.json({ error: 'Please select a team member' }, { status: 400 })

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true, manager: { select: { userId: true } } },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (employee.manager?.userId !== session.user.id) return NextResponse.json({ error: 'This employee is not one of your direct reports' }, { status: 403 })

  const existing = await db.performanceReview.findFirst({ where: { employeeId, status: 'REQUESTED' } })
  if (existing) return NextResponse.json({ error: 'A performance review request for this employee is already pending with HR' }, { status: 409 })

  const review = await db.performanceReview.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      status: 'REQUESTED',
      requestedById: session.user.id,
      requestNote: requestNote?.trim() || null,
    },
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } },
  })

  const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    const title = 'Performance review requested'
    const body = `${employee.fullName}'s manager requested a performance review.`
    await db.notification.createMany({ data: hrUsers.map(u => ({ userId: u.id, type: 'PERFORMANCE_REVIEW_REQUESTED', title, body })) }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-performance-reviews')

  return NextResponse.json(review, { status: 201 })
}
