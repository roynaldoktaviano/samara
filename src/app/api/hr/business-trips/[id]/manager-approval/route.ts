import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Stage-1 approval for a BusinessTrip (requiresManagerApproval) — distinct from the HR
// final decision in ../route.ts. Authorization here is identity-based (must be the
// specific manager resolved via Employee.managerId → manager.userId at request time),
// not role-based — mirrors src/app/api/purchasing/requests/[id]/approval/route.ts and
// src/app/api/hr/leave-requests/[id]/crew-approval/route.ts.
// Approving here doesn't finalize the request — it moves to PENDING_HR_APPROVAL so HR
// still signs off. Rejecting here is final.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { action, decisionNote } = body as { action?: 'approve' | 'reject'; decisionNote?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.businessTrip.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true, managerId: true, manager: { select: { userId: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.requiresManagerApproval) return NextResponse.json({ error: "This request doesn't need manager approval" }, { status: 409 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already moved past the manager approval stage' }, { status: 409 })
  if (existing.employee.manager?.userId !== session.user.id) return NextResponse.json({ error: "This business trip isn't yours to approve" }, { status: 403 })

  const updated = await db.businessTrip.update({
    where: { id },
    data: action === 'approve'
      ? {
          status: 'PENDING_HR_APPROVAL',
          managerApprovedById: session.user.id,
          managerApprovedAt: new Date(),
          managerDecisionNote: decisionNote?.trim() || null,
        }
      : {
          status: 'REJECTED',
          managerApprovedById: session.user.id,
          managerApprovedAt: new Date(),
          managerDecisionNote: decisionNote?.trim() || null,
          decidedById: session.user.id,
          decidedAt: new Date(),
          decisionNote: decisionNote?.trim() || null,
        },
    include: { employee: { select: { fullName: true, userId: true } } },
  })

  if (action === 'approve') {
    const title = 'Business trip request needs HR approval'
    const body = `${updated.employee.fullName}'s business trip to ${updated.destination} was approved by their manager and now needs HR sign-off.`
    const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
    if (hrUsers.length) {
      await db.notification.createMany({
        data: hrUsers.map(u => ({ userId: u.id, type: 'BUSINESS_TRIP_HR_APPROVAL_NEEDED', title, body })),
      }).catch(() => {})
      sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
    }
  } else if (updated.employee.userId) {
    const title = 'Business trip request rejected'
    const body = `Your business trip to ${updated.destination} was rejected by your manager.`
    await db.notification.create({ data: { userId: updated.employee.userId, type: 'BUSINESS_TRIP_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [updated.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-business-trips')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
