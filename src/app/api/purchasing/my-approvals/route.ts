import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// Two independent things a logged-in user might be waiting to act on:
//  - PR intake approvals: resolved via Employee.userId → PurchaseRequest.approverEmployeeId
//    (a PR's manager can hold any Role).
//  - Quotation/supplier-selection approvals: resolved via PurchaseRequestItem.quotationApproverId,
//    set directly to a User.id by resolveQuotationApproverId at submission time.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })

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
  })
}
