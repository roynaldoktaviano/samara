import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { sanitizeFreelanceRecommendations, crewLeaveStage, resolveCrewStageApprover, resolveYachtCrewApprovers, notifyLeaveReachedHr } from '@/lib/leave-request'

// Crew-stage approval for a LeaveRequest (requiresCrewApproval) — distinct from the HR
// final decision in ../route.ts. Two steps since 2026-11-09: Captain first, then the
// Cruise Director (only Otium/Mischief have one); see crewLeaveStage. Authorization is
// identity-based — the caller must be the specific Captain/CD assigned to the employee's
// yacht for the *current* step (resolveCrewStageApprover), not just anyone with the role.
// Captain approving with a CD step left → stays PENDING and the CD is notified; the last
// crew step approving → PENDING_HR_APPROVAL, HR notified + FYI to Purchasing/Accounting
// (notifyLeaveReachedHr). Rejecting at any crew step is final.
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
  if (!existing.requiresCrewApproval) return NextResponse.json({ error: "This request doesn't need Captain/Cruise Director approval" }, { status: 409 })
  const stage = crewLeaveStage(existing)
  if (!stage) return NextResponse.json({ error: 'This request has already moved past the crew approval stage' }, { status: 409 })

  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts(
    [{ id: existing.employee.id, locationName: existing.employee.location?.name ?? null }],
    yachts,
  ).get(existing.employee.id)
  const approver = await resolveCrewStageApprover(db, existing, yachtId)
  if (!approver || approver.id !== session.user.id) {
    return NextResponse.json({ error: "This leave request isn't yours to approve" }, { status: 403 })
  }

  const note = decisionNote?.trim() || null
  const now = new Date()
  // The Captain/CD knows the yacht's crew needs best — let them set or correct the
  // freelance flag/recommendations the requester filled in, same shape as the
  // requester's own form (src/lib/leave-request.ts).
  const freelancePatch = needsFreelance !== undefined ? {
    needsFreelance: !!needsFreelance,
    freelanceRecommendations: sanitizeFreelanceRecommendations(freelanceRecommendations) as unknown as Prisma.InputJsonValue,
  } : {}
  const goesToCd = stage === 'captain' && existing.requiresCdApproval

  const data: Prisma.LeaveRequestUncheckedUpdateManyInput = action === 'reject'
    ? { status: 'REJECTED', decidedById: session.user.id, decidedAt: now, decisionNote: note }
    : stage === 'captain'
      ? {
          ...freelancePatch,
          status: goesToCd ? 'PENDING' : 'PENDING_HR_APPROVAL',
          captainApprovedById: session.user.id, captainApprovedAt: now, captainDecisionNote: note,
        }
      : {
          ...freelancePatch,
          status: 'PENDING_HR_APPROVAL',
          crewApprovedById: session.user.id, crewApprovedAt: now, crewDecisionNote: note,
        }

  // Conditional on still being PENDING so two approvers clicking at once can't both act.
  const res = await db.leaveRequest.updateMany({ where: { id, status: 'PENDING' }, data })
  if (res.count === 0) return NextResponse.json({ error: 'This request was already updated — refresh and try again' }, { status: 409 })
  const updated = await db.leaveRequest.findUnique({ where: { id } })

  const kind = existing.type === 'WFH' ? 'WFH' : 'leave'
  if (action === 'approve') {
    if (goesToCd) {
      const { cd } = yachtId ? await resolveYachtCrewApprovers(db, yachtId) : { cd: null }
      if (cd) {
        const title = existing.type === 'WFH' ? 'Crew WFH request needs your approval' : 'Crew leave request needs your approval'
        const body = `${existing.employee.fullName} requested ${existing.days} day${existing.days !== 1 ? 's' : ''} ${kind}; approved by ${approver.name ? `Captain ${approver.name}` : 'the Captain'}, now waiting on you.`
        await db.notification.create({ data: { userId: cd.id, type: 'LEAVE_APPROVAL_NEEDED', title, body } }).catch(() => {})
        sendPushToUsers(db, [cd.id], { title, body }).catch(() => {})
      }
    } else {
      await notifyLeaveReachedHr(db, {
        employeeName: existing.employee.fullName, type: existing.type, days: existing.days,
        startDate: existing.startDate, endDate: existing.endDate,
        approvedByLabel: `${approver.label} ${approver.name ?? ''}`.trim(), isCrew: true,
      })
    }
  } else if (existing.employee.userId) {
    const title = existing.type === 'WFH' ? 'WFH request rejected' : 'Leave request rejected'
    const body = `Your ${kind} request (${existing.days} day${existing.days !== 1 ? 's' : ''}) was rejected by the ${approver.label}.`
    await db.notification.create({ data: { userId: existing.employee.userId, type: 'LEAVE_DECIDED', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(updated)
}
