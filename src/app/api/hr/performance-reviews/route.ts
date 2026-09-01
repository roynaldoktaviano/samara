import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

const RATING_FIELDS = [
  'attendanceDiscipline', 'workPerformance', 'communicationTeamwork',
  'attitudeResponsibility', 'initiativeProblemSolving', 'adaptabilityLearning',
] as const

const RATINGS = ['NEEDS_IMPROVEMENT', 'GOOD', 'VERY_GOOD', 'EXCELLENT']
const DECISIONS = ['CONFIRM_PERMANENT', 'EXTEND_PROBATION', 'END_EMPLOYMENT']

// Shared shape for the appraisal form fields — used by both this route's direct-create
// POST and [id]/route.ts's fill-in/edit PATCH.
export function reviewFormData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const field of RATING_FIELDS) {
    const v = body[field]
    data[field] = v && RATINGS.includes(v as string) ? v : null
  }
  data.managerComments = typeof body.managerComments === 'string' ? body.managerComments.trim() || null : null
  data.decision = body.decision && DECISIONS.includes(body.decision as string) ? body.decision : null
  data.salaryIncrementApproved = !!body.salaryIncrementApproved
  data.currentSalary = typeof body.currentSalary === 'number' ? body.currentSalary : null
  data.newSalary = typeof body.newSalary === 'number' ? body.newSalary : null
  data.effectiveDate = body.effectiveDate ? new Date(body.effectiveDate as string) : null
  data.reviewDate = body.reviewDate ? new Date(body.reviewDate as string) : null
  data.reasonNotes = typeof body.reasonNotes === 'string' ? body.reasonNotes.trim() || null : null
  return data
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const reviews = await db.performanceReview.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, department: true, employmentStatus: true } },
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(reviews)
}

// HR creating a review directly (no manager request behind it) — fills in the whole
// appraisal form in one go, so it's created already COMPLETED.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { employeeId } = body as { employeeId?: string }
  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const review = await db.performanceReview.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      status: 'COMPLETED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      ...reviewFormData(body),
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, department: true, employmentStatus: true } },
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(review, { status: 201 })
}
