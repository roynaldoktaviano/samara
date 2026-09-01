import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { reviewFormData } from '../route'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// HR filling in (from REQUESTED) or editing (already COMPLETED) the appraisal form —
// always leaves the review COMPLETED.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.performanceReview.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const wasRequested = existing.status === 'REQUESTED'
  const updated = await db.performanceReview.update({
    where: { id },
    data: {
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

  if (wasRequested && existing.requestedById) {
    const title = 'Performance review completed'
    const body2 = `HR has completed the performance review you requested for ${existing.employee.fullName}.`
    await db.notification.create({ data: { userId: existing.requestedById, type: 'PERFORMANCE_REVIEW_COMPLETED', title, body: body2 } }).catch(() => {})
    sendPushToUsers(db, [existing.requestedById], { title, body: body2 }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-performance-reviews')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
