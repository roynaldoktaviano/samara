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
  const reviews = await db.probationReview.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, department: true, employmentStatus: true } },
      requestedBy: { select: { id: true, name: true } },
      hrDecidedBy: { select: { id: true, name: true } },
      managementDecidedBy: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(reviews)
}

// Requested by Manager (or HR submitting on a manager's behalf) — starts the review at
// HR_REVIEW directly, since Management/Admin/Super Admin/HR are the only roles that can
// even reach this screen; there's no separate "manager self-service" step to model.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, requestNote } = await req.json()
  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const existing = await db.probationReview.findFirst({
    where: { employeeId, stage: { in: ['REQUESTED', 'HR_REVIEW', 'MANAGEMENT_APPROVAL'] } },
  })
  if (existing) return NextResponse.json({ error: 'This employee already has a probation review in progress' }, { status: 409 })

  const review = await db.probationReview.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      stage: 'HR_REVIEW',
      requestedById: session.user.id,
      requestNote: requestNote?.trim() || null,
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, department: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  })

  const hrUsers = await db.user.findMany({ where: { role: { in: ALLOWED as never[] }, id: { not: session.user.id } }, select: { id: true } })
  if (hrUsers.length) {
    const title = 'Probation review needs HR review'
    const body = `${employee.fullName} — probation review submitted, waiting for HR review.`
    await db.notification.createMany({ data: hrUsers.map(u => ({ userId: u.id, type: 'PROBATION_HR_REVIEW_NEEDED', title, body })) }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }

  return NextResponse.json(review, { status: 201 })
}
