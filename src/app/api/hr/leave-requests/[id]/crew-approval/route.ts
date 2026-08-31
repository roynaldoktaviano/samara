import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, resolveCrewLeaveApprover } from '@/lib/leave-request'

const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Stage-1 approval for a crew LeaveRequest (LeaveRequest.requiresCrewApproval) — distinct
// from the HR final decision in ../route.ts. Authorization here is identity-based (must
// be the specific Cruise Director, or Captain if there's no CD, resolved for the
// employee's yacht via resolveCrewLeaveApprover), not role-based — mirrors
// src/app/api/purchasing/requests/[id]/approval/route.ts's manager-approval pattern.
// Approving here doesn't finalize the request — it moves to PENDING_HR_APPROVAL so HR
// still signs off (and debits leaveBalance / syncs Attendance) at ../route.ts. Rejecting
// here is final, same as an HR rejection, since there's nothing left to approve.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { action, decisionNote, needsFreelance, freelanceRecommendations } = body as {
    action?: 'approve' | 'reject'; decisionNote?: string; needsFreelance?: boolean; freelanceRecommendations?: unknown
  }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true, location: { select: { name: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.requiresCrewApproval) return NextResponse.json({ error: "This request doesn't need Cruise Director/Captain approval" }, { status: 409 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already moved past the crew approval stage' }, { status: 409 })

  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts(
    [{ id: existing.employee.id, locationName: existing.employee.location?.name ?? null }],
    yachts,
  ).get(existing.employee.id)
  const approver = yachtId ? await resolveCrewLeaveApprover(db, yachtId) : null
  if (!approver || approver.id !== session.user.id) {
    return NextResponse.json({ error: "This leave request isn't yours to approve" }, { status: 403 })
  }

  const updated = await db.leaveRequest.update({
    where: { id },
    data: action === 'approve'
      ? {
          status: 'PENDING_HR_APPROVAL',
          crewApprovedById: session.user.id,
          crewApprovedAt: new Date(),
          crewDecisionNote: decisionNote?.trim() || null,
          // The Cruise Director/Captain knows the yacht's crew needs best — let them set
          // or correct the freelance flag/recommendations the requester filled in, same
          // shape as the requester's own form (src/lib/leave-request.ts).
          ...(needsFreelance !== undefined ? {
            needsFreelance: !!needsFreelance,
            freelanceRecommendations: sanitizeFreelanceRecommendations(freelanceRecommendations) as unknown as Prisma.InputJsonValue,
          } : {}),
        }
      : {
          status: 'REJECTED',
          decidedById: session.user.id,
          decidedAt: new Date(),
          decisionNote: decisionNote?.trim() || null,
        },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } },
      requestedBy: { select: { id: true, name: true } },
      crewApprovedBy: { select: { id: true, name: true } },
    },
  })

  if (action === 'approve') {
    const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
    if (hrUsers.length) {
      const title = 'Leave request needs your final approval'
      const body = `${existing.employee.fullName}'s leave request was approved by the Cruise Director/Captain and now needs HR sign-off.`
      await db.notification.createMany({
        data: hrUsers.map(u => ({ id: crypto.randomUUID(), userId: u.id, type: 'LEAVE_APPROVAL_NEEDED', title, body })),
        skipDuplicates: true,
      }).catch(() => {})
      sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
    }
  } else if (existing.employee.userId) {
    const title = 'Leave request rejected'
    const body = `Your leave request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was rejected.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
