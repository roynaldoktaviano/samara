import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { getBand } from '@/lib/purchasing/quotationBands'
import { CLEARED_QUOTATION_APPROVAL_FIELDS } from '@/lib/purchasing/quotationApproval'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Items can only be edited while the request is On Process' }, { status: 409 })
  }

  const existingItem = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, quantity: true, estimatedCost: true, supplierId: true, selectionJustification: true },
  })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const body = await req.json()
  const { estimatedCost, supplierId, supplierName, exemptionReason, selectionJustification } = body

  // A reason must be on file for every supplier picked against gathered quotations (band
  // B+ items with at least one quotation on record) — mirrors the client-side gate in
  // RequestsPage so the check can't be skipped by calling this endpoint directly.
  const finalEstimatedCost = estimatedCost !== undefined ? (Number(estimatedCost) || 0) : existingItem.estimatedCost
  const finalSupplierId = supplierId !== undefined ? (supplierId || null) : existingItem.supplierId
  const finalJustification = selectionJustification !== undefined ? (String(selectionJustification).trim()) : (existingItem.selectionJustification ?? '')
  const band = getBand(existingItem.quantity * finalEstimatedCost)
  if (band !== 'A' && finalSupplierId && !finalJustification) {
    const quotationCount = await db.purchaseQuotation.count({ where: { requestItemId: itemId } })
    if (quotationCount > 0) {
      return NextResponse.json({ error: 'Please provide a reason for the selected supplier' }, { status: 400 })
    }
  }

  // A previously submitted/approved/rejected decision no longer means anything once the
  // price or the chosen supplier actually changes — clear it so Convert to PO can't rely
  // on stale sign-off for a decision nobody re-approved.
  const decisionChanged = finalEstimatedCost !== existingItem.estimatedCost || finalSupplierId !== existingItem.supplierId

  const item = await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      ...(estimatedCost !== undefined && { estimatedCost: Number(estimatedCost) || 0 }),
      ...(supplierId !== undefined && { supplierId: supplierId || null, supplierName: supplierName || null }),
      ...(exemptionReason !== undefined && { exemptionReason: exemptionReason?.trim() || null }),
      ...(selectionJustification !== undefined && { selectionJustification: selectionJustification?.trim() || null }),
      ...(decisionChanged && CLEARED_QUOTATION_APPROVAL_FIELDS),
    },
  })
  return NextResponse.json(item)
}
