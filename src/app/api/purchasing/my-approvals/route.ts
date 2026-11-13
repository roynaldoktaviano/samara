import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { resolveCrewStageApprover } from '@/lib/leave-request'
import { RECRUITMENT_REQUEST_INCLUDE } from '@/lib/hr/recruitment'

// Three independent things a logged-in user might be waiting to act on — despite the
// purchasing/ path (this page/endpoint predates HR's crew-approval addition and is the
// one generic "My Approvals" aggregator in the app, so the new item was added here
// rather than opening a second aggregator surface):
//  - PR intake approvals: resolved via Employee.userId → PurchaseRequest.approverEmployeeId
//    (a PR's manager can hold any Role).
//  - Quotation/supplier-selection approvals: resolved via PurchaseRequestItem.quotationApproverId,
//    set directly to a User.id by resolveQuotationApproverId at submission time.
//  - Crew leave requests: resolved via User.role BOAT_CAPTAIN (step 1) / CRUISE_DIRECTOR
//    (step 2) + assignedYachtId matching the requester's yacht (Employee.location.name ===
//    Yacht.name) — see src/lib/leave-request.ts's crewLeaveStage/resolveCrewStageApprover.
//  - Recruitment requests: resolved via RecruitmentRequestApproval.approverId (the approver
//    chain set in HR › Recruitment › Approvers), still undecided while AWAITING_APPROVAL.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, assignedYachtId: true } })

  // Business trips waiting on this user as the resolved manager (Employee.managerId of
  // the requester → this user's Employee.id) — any role can be a manager, so this is
  // identity-based like the PR approval check above, not role-gated.
  const businessTripApprovals = employee
    ? await db.businessTrip.findMany({
        where: { status: 'PENDING', requiresManagerApproval: true, employee: { managerId: employee.id } },
        orderBy: { requestedAt: 'asc' },
        include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } },
      })
    : []

  const [prRequests, quotationItems] = await Promise.all([
    employee
      ? db.purchaseRequest.findMany({
          where: { approverEmployeeId: employee.id, status: 'PENDING_APPROVAL' },
          orderBy: [{ isUrgent: 'desc' }, { createdAt: 'asc' }],
          include: {
            items: { select: { id: true, quantity: true, estimatedCost: true } },
            deliveryLocation: { select: { id: true, name: true } },
            requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true, department: true } },
            requestedBy: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    db.purchaseRequestItem.findMany({
      where: { quotationApproverId: session.user.id, quotationSubmittedAt: { not: null }, quotationApprovedAt: null, quotationRejectedAt: null },
      orderBy: { quotationSubmittedAt: 'asc' },
      include: {
        request: { select: { id: true, prNumber: true } },
        quotationSubmittedBy: { select: { name: true } },
        quotations: { orderBy: { price: 'asc' } },
      },
    }),
  ])

  // Crew leave requests waiting on this user specifically — only those whose *current*
  // crew step (Captain, then Cruise Director — see crewLeaveStage) resolves to this user
  // for their assigned yacht, never every CD/Captain-role user in the company.
  const crewLeaveRequests: Omit<Awaited<ReturnType<typeof db.leaveRequest.findMany>>[number], 'attachments'>[] = []
  if (user?.assignedYachtId && (user.role === 'CRUISE_DIRECTOR' || user.role === 'BOAT_CAPTAIN')) {
    const pending = await db.leaveRequest.findMany({
      where: { status: 'PENDING', requiresCrewApproval: true },
      orderBy: { requestedAt: 'asc' },
      omit: { attachments: true },
      include: {
        employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true, location: { select: { name: true } } } },
        captainApprovedBy: { select: { id: true, name: true } },
      },
    })
    const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
    const yachtIdByEmployeeId = matchEmployeesToYachts(
      pending.map(r => ({ id: r.employee.id, locationName: r.employee.location?.name ?? null })),
      yachts,
    )
    const mine = pending.filter(r => yachtIdByEmployeeId.get(r.employee.id) === user.assignedYachtId)
    for (const r of mine) {
      const approver = await resolveCrewStageApprover(db, r, user.assignedYachtId)
      if (approver?.id === session.user.id) crewLeaveRequests.push(r)
    }
  }

  // Leave requests waiting on this user as the employee's manager (non-crew stage 1 —
  // LeaveRequest.requiresManagerApproval), identity-based like business trips above.
  const managerLeaveApprovals = employee
    ? await db.leaveRequest.findMany({
        where: { status: 'PENDING', requiresManagerApproval: true, employee: { managerId: employee.id } },
        orderBy: { requestedAt: 'asc' },
        omit: { attachments: true },
        include: { employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true } } },
      })
    : []

  const recruitmentApprovals = await db.recruitmentRequest.findMany({
    where: { status: 'AWAITING_APPROVAL', approvals: { some: { approverId: session.user.id, decision: null } } },
    orderBy: { createdAt: 'asc' },
    include: RECRUITMENT_REQUEST_INCLUDE,
  })

  return NextResponse.json({
    prApprovals: prRequests.map(r => ({
      ...r,
      itemCount: r.items.length,
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
      // requestedByEmployee is null for internal Purchasing/Admin self-requests where
      // nobody was picked in the "Requested By" dropdown — fall back to the ERP login
      // that submitted it so the approver never sees a blank requester.
      requestedByEmployee: r.requestedByEmployee ?? (r.requestedBy ? { id: r.requestedBy.id, fullName: r.requestedBy.name ?? 'Unknown', employeeNumber: '', department: null } : null),
      requestedBy: undefined,
      items: undefined,
    })),
    quotationApprovals: quotationItems,
    crewLeaveApprovals: crewLeaveRequests,
    managerLeaveApprovals,
    businessTripApprovals,
    recruitmentApprovals,
  })
}
