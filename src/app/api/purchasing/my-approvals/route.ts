import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { matchEmployeesToYachts } from '@/lib/payroll'
import { resolveCrewLeaveApprover } from '@/lib/leave-request'

// Three independent things a logged-in user might be waiting to act on — despite the
// purchasing/ path (this page/endpoint predates HR's crew-approval addition and is the
// one generic "My Approvals" aggregator in the app, so the new item was added here
// rather than opening a second aggregator surface):
//  - PR intake approvals: resolved via Employee.userId → PurchaseRequest.approverEmployeeId
//    (a PR's manager can hold any Role).
//  - Quotation/supplier-selection approvals: resolved via PurchaseRequestItem.quotationApproverId,
//    set directly to a User.id by resolveQuotationApproverId at submission time.
//  - Crew leave requests: resolved via User.role CRUISE_DIRECTOR/BOAT_CAPTAIN +
//    assignedYachtId matching the requester's yacht (Employee.location.name === Yacht.name)
//    — see src/lib/leave-request.ts's resolveCrewLeaveApprover.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, assignedYachtId: true } })

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

  // Crew leave requests waiting on this user specifically — only if they're the one
  // resolved yacht approver (Cruise Director takes priority over Captain, never both;
  // see resolveCrewLeaveApprover), never every CD/Captain-role user in the company.
  let crewLeaveRequests: Awaited<ReturnType<typeof db.leaveRequest.findMany>> = []
  if (user?.assignedYachtId && (user.role === 'CRUISE_DIRECTOR' || user.role === 'BOAT_CAPTAIN')) {
    const approver = await resolveCrewLeaveApprover(db, user.assignedYachtId)
    if (approver?.id === session.user.id) {
      const pending = await db.leaveRequest.findMany({
        where: { status: 'PENDING', requiresCrewApproval: true },
        orderBy: { requestedAt: 'asc' },
        include: { employee: { select: { id: true, fullName: true, employeeNumber: true, leaveBalance: true, location: { select: { name: true } } } } },
      })
      const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
      const yachtIdByEmployeeId = matchEmployeesToYachts(
        pending.map(r => ({ id: r.employee.id, locationName: r.employee.location?.name ?? null })),
        yachts,
      )
      crewLeaveRequests = pending.filter(r => yachtIdByEmployeeId.get(r.employee.id) === user.assignedYachtId)
    }
  }

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
  })
}
