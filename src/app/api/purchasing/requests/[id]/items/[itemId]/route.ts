import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
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

  const existingItem = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { id: true, requestId: true, itemId: true, itemName: true, unit: true, quantity: true, estimatedCost: true, supplierId: true, quotationApprovedAt: true, convertedAt: true },
  })
  if (!existingItem || existingItem.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const body = await req.json()
  const { estimatedCost, supplierId, supplierName, exemptionReason, isStockItem, verifyRejected, verifyRejectionReason } = body

  // Price/supplier/etc are only editable once the PR has been verified (ON_PROCESS) — same
  // gate as before. The accept/reject decision below is a separate, earlier-stage action
  // (triage before/at verify), so it's handled independently of that gate.
  if ((estimatedCost !== undefined || supplierId !== undefined || exemptionReason !== undefined || isStockItem !== undefined)
      && request.status !== 'ON_PROCESS') {
    return NextResponse.json({ error: 'Items can only be edited while the request is On Process' }, { status: 409 })
  }

  // Once a quotation has been approved, price and supplier are locked to the approver's
  // decision — Purchasing can no longer overwrite them from this endpoint.
  const priceLocked = !!existingItem.quotationApprovedAt
  const finalEstimatedCost = !priceLocked && estimatedCost !== undefined ? (Number(estimatedCost) || 0) : existingItem.estimatedCost
  const finalSupplierId = !priceLocked && supplierId !== undefined ? (supplierId || null) : existingItem.supplierId

  // A previously submitted/approved/rejected decision no longer means anything once the
  // price or the chosen supplier actually changes — clear it so Convert to PO can't rely
  // on stale sign-off for a decision nobody re-approved.
  const decisionChanged = !priceLocked && (finalEstimatedCost !== existingItem.estimatedCost || finalSupplierId !== existingItem.supplierId)

  // Accept/reject this item at verify triage — allowed while DRAFT (pre-verify) or
  // ON_PROCESS (Purchasing changes their mind before converting), but never once the item
  // has actually been swept into a PO/Transfer.
  if (verifyRejected !== undefined) {
    if (!['DRAFT', 'ON_PROCESS'].includes(request.status)) {
      return NextResponse.json({ error: 'Item decisions can only change while the request is Draft or On Process' }, { status: 409 })
    }
    if (existingItem.convertedAt) {
      return NextResponse.json({ error: 'Item has already been converted — its decision can no longer change' }, { status: 409 })
    }
  }

  // Promote a still-ad-hoc custom line (no catalog itemId) into a real master catalog
  // item the moment Purchasing classifies it Stock/Non-Stock here — this Save is already
  // the review/curation step, so there's no separate "add to master" action needed. If a
  // catalog item with the same name already exists, link to it instead of duplicating;
  // its existing isStockTracked flag is left as-is (the master, once created, is the
  // source of truth — not whatever this one request line happens to pick).
  let promotedItemId: string | null = null
  let promotedNew = false
  let promotedSku: string | null = null
  if (isStockItem !== undefined && !existingItem.itemId) {
    const trimmedName = existingItem.itemName.trim()
    const match = await db.purchaseItem.findFirst({ where: { name: { equals: trimmedName, mode: 'insensitive' } } })
    if (match) {
      promotedItemId = match.id
    } else {
      const prefix = 'NS-'
      const last = await db.purchaseItem.findFirst({
        where: { sku: { startsWith: prefix } },
        orderBy: { sku: 'desc' },
        select: { sku: true },
      })
      const lastNum = last ? parseInt(last.sku.slice(prefix.length), 10) || 0 : 0
      const sku = `${prefix}${String(lastNum + 1).padStart(4, '0')}`
      const unit = existingItem.unit?.trim() || 'pcs'
      const created = await db.purchaseItem.create({
        data: {
          id: crypto.randomUUID(),
          sku,
          name: trimmedName,
          type: 'MAINTENANCE',
          category: 'Non-Stock',
          baseUnit: unit,
          purchaseUnit: unit,
          isStockTracked: !!isStockItem,
          updatedAt: new Date(),
        },
      })
      promotedItemId = created.id
      promotedNew = true
      promotedSku = created.sku
    }
  }

  const item = await db.purchaseRequestItem.update({
    where: { id: itemId },
    data: {
      ...(!priceLocked && estimatedCost !== undefined && { estimatedCost: Number(estimatedCost) || 0 }),
      ...(!priceLocked && supplierId !== undefined && { supplierId: supplierId || null, supplierName: supplierName || null }),
      ...(exemptionReason !== undefined && { exemptionReason: exemptionReason?.trim() || null }),
      ...(isStockItem !== undefined && { isStockItem: !!isStockItem }),
      ...(promotedItemId && { itemId: promotedItemId }),
      ...(decisionChanged && CLEARED_QUOTATION_APPROVAL_FIELDS),
      ...(verifyRejected !== undefined && {
        verifyRejectedById: verifyRejected ? session.user.id : null,
        verifyRejectedAt: verifyRejected ? new Date() : null,
        verifyRejectionReason: verifyRejected ? (verifyRejectionReason?.trim() || null) : null,
      }),
    },
  })
  return NextResponse.json({ ...item, promotedNew, promotedSku })
}
