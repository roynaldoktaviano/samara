import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { emitTenantEvent } from '@/lib/realtime-bus'
import {
  RECRUITMENT_REQUEST_INCLUDE, notifyRecruitmentReachedHr, notifyRecruitmentRequester,
} from '@/lib/hr/recruitment'

// One approver's decision on a request in AWAITING_APPROVAL (from My Approvals) —
// identity-gated: only a user holding an undecided approval row on this request.
// All approvers must approve → PENDING (HR takes over); any reject → REJECTED.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { action, note } = await req.json() as { action?: string; note?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const approval = await db.recruitmentRequestApproval.findUnique({
    where: { requestId_approverId: { requestId: id, approverId: session.user.id } },
    include: { request: { select: { status: true } } },
  })
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (approval.decision || approval.request.status !== 'AWAITING_APPROVAL') {
    return NextResponse.json({ error: 'This request is no longer waiting for your approval' }, { status: 409 })
  }

  const decidedAt = new Date()
  const trimmedNote = note?.trim() || null

  const updated = await db.$transaction(async tx => {
    // Conditional update so two clicks / two tabs can't both record a decision.
    const res = await tx.recruitmentRequestApproval.updateMany({
      where: { id: approval.id, decision: null },
      data: { decision: action === 'approve' ? 'APPROVED' : 'REJECTED', decidedAt, note: trimmedNote },
    })
    if (res.count === 0) return null

    if (action === 'reject') {
      return tx.recruitmentRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedById: session.user.id, decidedAt, decisionNote: trimmedNote },
        include: RECRUITMENT_REQUEST_INCLUDE,
      })
    }
    const stillWaiting = await tx.recruitmentRequestApproval.count({ where: { requestId: id, decision: null } })
    if (stillWaiting > 0) return tx.recruitmentRequest.findUniqueOrThrow({ where: { id }, include: RECRUITMENT_REQUEST_INCLUDE })
    return tx.recruitmentRequest.update({ where: { id }, data: { status: 'PENDING' }, include: RECRUITMENT_REQUEST_INCLUDE })
  })
  if (!updated) return NextResponse.json({ error: 'This request is no longer waiting for your approval' }, { status: 409 })

  const approverName = session.user.name ?? session.user.email ?? 'An approver'
  const what = `${updated.headcount}× ${updated.role.title}`
  if (updated.status === 'REJECTED') {
    await notifyRecruitmentRequester(db, updated.requestedById, 'Recruitment request rejected',
      `Your request to hire ${what} was rejected by ${approverName}.${trimmedNote ? ` Reason: ${trimmedNote}` : ''}`)
  } else if (updated.status === 'PENDING') {
    await notifyRecruitmentRequester(db, updated.requestedById, 'Recruitment request sent to HR',
      `Your request to hire ${what} was approved by all approvers and is now with HR.`)
    await notifyRecruitmentReachedHr(db, updated, updated.requestedById)
  }

  emitTenantEvent(session.user.tenantId, 'my-approvals')
  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json(updated)
}
