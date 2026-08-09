import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { sendPushToUsers } from '@/lib/push'
import { roleMatches } from '@/lib/role-utils'
import { getBand, requiredQuotationCount } from '@/lib/purchasing/quotationBands'
import { resolveQuotationApproverId, itemRequiresQuotationApproval } from '@/lib/purchasing/quotationApproval'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

// Submits an item's gathered quotations for the submitter's manager to approve —
// resolved fresh each time via resolveQuotationApproverId (Employee.managerId chain).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, prNumber: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Items can only be submitted for approval while the request is On Process' }, { status: 409 })
  }

  const item = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: {
      id: true, requestId: true, itemId: true, itemName: true, quantity: true, estimatedCost: true,
      supplierId: true, selectionJustification: true, quotationApprovedAt: true,
      _count: { select: { quotations: true } },
    },
  })
  if (!item || item.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!item.supplierId) return NextResponse.json({ error: 'Choose a supplier first' }, { status: 400 })
  if (item.quotationApprovedAt) return NextResponse.json({ error: 'This item is already approved' }, { status: 409 })

  const band = getBand(item.quantity * item.estimatedCost)
  if (band === 'A') return NextResponse.json({ error: 'This item does not require quotation approval' }, { status: 400 })

  const needsApproval = await itemRequiresQuotationApproval(db, item)
  if (!needsApproval) {
    return NextResponse.json({ error: "This supplier has a known purchase history for this item — no approval needed" }, { status: 400 })
  }

  const required = requiredQuotationCount(band)
  if (item._count.quotations < required) {
    return NextResponse.json({ error: `At least ${required} quotation${required > 1 ? 's' : ''} required before submitting for approval` }, { status: 400 })
  }

  if (!item.selectionJustification?.trim()) {
    const quotations = await db.purchaseQuotation.findMany({ where: { requestItemId: itemId }, select: { supplierId: true, price: true } })
    const cheapest = quotations.reduce((a, b) => (a.price < b.price ? a : b))
    if ((cheapest.supplierId ?? null) !== item.supplierId) {
      return NextResponse.json({ error: 'Provide a reason for the selected supplier first' }, { status: 400 })
    }
  }

  const approverId = await resolveQuotationApproverId(db, session.user.id)
  if (!approverId) return NextResponse.json({ error: 'No approver could be resolved — contact an admin' }, { status: 500 })

  await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      quotationSubmittedById: session.user.id,
      quotationApproverId: approverId,
      quotationSubmittedAt: new Date(),
      quotationApprovedById: null, quotationApprovedAt: null,
      quotationRejectedById: null, quotationRejectedAt: null, quotationRejectionReason: null,
    },
  })

  db.notification.create({
    data: {
      id: crypto.randomUUID(), userId: approverId, type: 'PR_QUOTATION_APPROVAL',
      title: 'Supplier selection needs approval',
      body: `${request.prNumber} — "${item.itemName}" is waiting for you to approve the chosen supplier.`,
      requestId: id,
    },
  }).catch(console.error)
  sendPushToUsers(db, [approverId], {
    title: 'Supplier selection needs approval',
    body: `${request.prNumber} — "${item.itemName}" is waiting for your approval.`,
    url: '/',
  }).catch(console.error)

  return NextResponse.json({ ok: true, approverId })
}

// Approve/reject — identity-based against the item's resolved quotationApproverId
// (fixed at submission time), with a SUPER_ADMIN override for when the resolved
// approver is unavailable.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { action, reason } = body as { action?: 'approve' | 'reject'; reason?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  if (action === 'reject' && !reason?.trim()) return NextResponse.json({ error: 'A reason is required to reject' }, { status: 400 })

  const item = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, itemName: true, quotationApproverId: true, quotationSubmittedAt: true, quotationApprovedAt: true, quotationSubmittedById: true, request: { select: { prNumber: true } } },
  })
  if (!item || item.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!item.quotationSubmittedAt) return NextResponse.json({ error: 'This item is not awaiting approval' }, { status: 409 })
  if (item.quotationApprovedAt) return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  if (item.quotationApproverId !== session.user.id && !roleMatches(role, ['SUPER_ADMIN'])) {
    return NextResponse.json({ error: 'This is not yours to approve' }, { status: 403 })
  }

  const updated = await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: action === 'approve'
      ? { quotationApprovedById: session.user.id, quotationApprovedAt: new Date() }
      : { quotationRejectedById: session.user.id, quotationRejectedAt: new Date(), quotationRejectionReason: reason!.trim() },
  })

  const notifyUserId = item.quotationSubmittedById
  if (notifyUserId) {
    db.notification.create({
      data: {
        id: crypto.randomUUID(), userId: notifyUserId,
        type: action === 'approve' ? 'PR_QUOTATION_APPROVED' : 'PR_QUOTATION_REJECTED',
        title: action === 'approve' ? 'Supplier selection approved' : 'Supplier selection rejected',
        body: action === 'approve'
          ? `${item.request.prNumber} — "${item.itemName}" was approved.`
          : `${item.request.prNumber} — "${item.itemName}" was rejected: ${reason!.trim()}`,
        requestId: id,
      },
    }).catch(console.error)
    sendPushToUsers(db, [notifyUserId], {
      title: action === 'approve' ? 'Supplier selection approved' : 'Supplier selection rejected',
      body: action === 'approve' ? `${item.request.prNumber} — "${item.itemName}" was approved.` : `${item.request.prNumber} — "${item.itemName}" was rejected.`,
      url: '/',
    }).catch(console.error)
  }

  return NextResponse.json(updated)
}
