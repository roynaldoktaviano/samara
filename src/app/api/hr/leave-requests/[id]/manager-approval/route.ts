import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { emitTenantEvent } from '@/lib/realtime-bus'
import { approveLeaveRequest, recordSupervisorRejection, supervisorDecisionData, supervisorStageFor } from '@/lib/leave-request'

// The employee's manager deciding a non-crew LeaveRequest (requiresManagerApproval).
// Parallel with HR since 2026-11-23 (see src/lib/leave-request.ts): approving finalizes
// the request on the spot (APPROVED + leave balance + Attendance Recap); rejecting only
// records the manager's reject — HR still makes the final call. Identity-based: must be
// the employee's current manager (Employee.managerId → manager.userId), any role.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { action, decisionNote } = await req.json() as { action?: 'approve' | 'reject'; decisionNote?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.leaveRequest.findUnique({
    where: { id },
    omit: { attachments: true },
    include: { employee: { select: { manager: { select: { userId: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existing.requiresManagerApproval) return NextResponse.json({ error: "This request doesn't need manager approval" }, { status: 409 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })
  if (existing.employee.manager?.userId !== session.user.id) return NextResponse.json({ error: "This leave request isn't yours to approve" }, { status: 403 })
  const stage = supervisorStageFor(existing, session.user.id, { managerUserId: existing.employee.manager?.userId })
  if (stage !== 'manager') return NextResponse.json({ error: 'You already decided on this request' }, { status: 409 })

  const note = decisionNote?.trim() || null
  const ok = action === 'approve'
    ? await approveLeaveRequest(db, {
        id, approverUserId: session.user.id, note, approvedByLabel: 'your manager', byHr: false,
        stageData: supervisorDecisionData('manager', session.user.id, note, false, new Date()),
      })
    : await recordSupervisorRejection(db, { id, stage: 'manager', userId: session.user.id, note, rejectedByLabel: 'the manager' })
  if (!ok) return NextResponse.json({ error: 'This request was already decided — refresh and try again' }, { status: 409 })

  emitTenantEvent(session.user.tenantId, 'hr-leave-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')

  const updated = await db.leaveRequest.findUnique({ where: { id }, omit: { attachments: true } })
  return NextResponse.json(updated)
}
