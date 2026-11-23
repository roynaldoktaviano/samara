import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { emitTenantEvent } from '@/lib/realtime-bus'
import { matchEmployeesToYachts } from '@/lib/payroll'
import {
  sanitizeFreelanceRecommendations, resolveYachtCrewApprovers, resolveCrewLeaveApprover, supervisorStageFor,
  supervisorDecisionData, approveLeaveRequest, recordSupervisorRejection, SUPERVISOR_STAGE_LABEL,
} from '@/lib/leave-request'

// The yacht's Captain or Cruise Director deciding a crew LeaveRequest
// (requiresCrewApproval). Parallel with each other and with HR since 2026-11-23 (see
// src/lib/leave-request.ts): either one approving finalizes the request on the spot
// (APPROVED + leave balance + Attendance Recap); rejecting only records their reject — HR
// (or the other on-board approver) can still approve. Identity-based: the caller must be
// the Captain/CD currently assigned to the employee's yacht (User.assignedYachtId).
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
    omit: { attachments: true },
    include: { employee: { select: { id: true, location: { select: { name: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.requiresCrewApproval) return NextResponse.json({ error: "This request doesn't need Captain/Cruise Director approval" }, { status: 409 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })

  const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
  const yachtId = matchEmployeesToYachts(
    [{ id: existing.employee.id, locationName: existing.employee.location?.name ?? null }],
    yachts,
  ).get(existing.employee.id)
  if (!yachtId) return NextResponse.json({ error: "This leave request isn't yours to approve" }, { status: 403 })
  const { captain, cd } = await resolveYachtCrewApprovers(db, yachtId)
  const legacy = !existing.requiresCaptainApproval && !existing.requiresCdApproval ? await resolveCrewLeaveApprover(db, yachtId) : null
  const stage = supervisorStageFor(existing, session.user.id, { captainId: captain?.id, cdId: cd?.id, legacyCrewApproverId: legacy?.id })
  if (!stage) return NextResponse.json({ error: "This leave request isn't yours to decide (or you already did)" }, { status: 403 })

  const note = decisionNote?.trim() || null
  const label = SUPERVISOR_STAGE_LABEL[stage]
  const myName = (stage === 'captain' ? captain?.name : stage === 'cd' ? (cd?.name ?? legacy?.name) : null) ?? null
  const byLabel = `${label}${myName ? ` ${myName}` : ''}`

  // The Captain/CD knows the yacht's crew needs best — let them set or correct the
  // freelance flag/recommendations the requester filled in.
  if (needsFreelance !== undefined) {
    await db.leaveRequest.update({
      where: { id },
      data: {
        needsFreelance: !!needsFreelance,
        freelanceRecommendations: sanitizeFreelanceRecommendations(freelanceRecommendations) as unknown as Prisma.InputJsonValue,
      },
    })
  }

  const ok = action === 'approve'
    ? await approveLeaveRequest(db, {
        id, approverUserId: session.user.id, note, approvedByLabel: `the ${byLabel}`, byHr: false,
        stageData: supervisorDecisionData(stage, session.user.id, note, false, new Date()),
      })
    : await recordSupervisorRejection(db, { id, stage, userId: session.user.id, note, rejectedByLabel: `the ${byLabel}` })
  if (!ok) return NextResponse.json({ error: 'This request was already decided — refresh and try again' }, { status: 409 })

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  const updated = await db.leaveRequest.findUnique({ where: { id }, omit: { attachments: true } })
  return NextResponse.json(updated)
}
