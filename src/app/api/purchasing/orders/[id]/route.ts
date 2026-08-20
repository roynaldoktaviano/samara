import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'
import { computePOGrandTotal, summarizePOPayments } from '@/lib/po-payment'
import { computeCurrentLegLabel } from '@/lib/purchasing/transitChain'
import { resolveWarehouseLocationId, warehouseCanViewOrder } from '@/lib/purchasing/warehouseScope'
import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED       = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const TRANSIT_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: { include: { item: { select: { purchaseUnit: true } } } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true, address: true } },
      booking: { select: { bookingCode: true, tripType: true, customer: { select: { name: true } }, yacht: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      supplier: { select: { name: true, locations: true, contact: true, phone: true, email: true } },
      request: {
        select: {
          requestedById: true,
          prNumber: true,
          createdAt: true,
          neededByDate: true,
          requestedBy: { select: { name: true } },
          requestedByEmployee: { select: { fullName: true, employeeNumber: true, department: true, location: { select: { name: true } } } },
        },
      },
      paymentRequests: {
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { name: true } },
          paidBy: { select: { name: true } },
        },
      },
      reimbursements: {
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { name: true } },
          paidBy: { select: { name: true } },
        },
      },
      followUps: {
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { name: true } }, escalatedTo: { select: { name: true } } },
      },
      transitStops: { orderBy: { sequence: 'asc' }, select: { locationId: true, sequence: true, location: { select: { id: true, name: true, type: true } } } },
      transitTransfers: {
        orderBy: { legSequence: 'asc' },
        select: {
          id: true, legSequence: true, status: true, dispatchedAt: true, receivedAt: true,
          dispatchPhotoKey: true, receivePhotoKey: true, receivedByName: true,
          dispatchedBy: { select: { name: true } },
          fromLocation: { select: { name: true, type: true, managedBy: true } }, toLocation: { select: { name: true, type: true, managedBy: true } },
          items: { select: { id: true, itemId: true, itemName: true, requestedQty: true, dispatchedQty: true, receivedQty: true } },
        },
      },
    },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Same scope as the list endpoint — a warehouse user can't open a PO by id-guessing
  // their way past what they're allowed to see.
  if (role === 'WAREHOUSE') {
    const locationId = await resolveWarehouseLocationId(db, session.user.id)
    if (!warehouseCanViewOrder(order, session.user.id, locationId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const createdByName = order.createdBy?.name ?? null
  const requestedByName = order.requestedByName ?? order.request?.requestedByEmployee?.fullName ?? null
  const requestedByOffice = order.requestedByOffice ?? order.request?.requestedByEmployee?.location?.name ?? null
  const requestedByDepartment = order.requestedByDepartment ?? order.request?.requestedByEmployee?.department ?? null
  const requestedByRole = order.requestedByRole ?? null

  const receipts = await db.goodsReceipt.findMany({
    where: { orderId: id },
    orderBy: { receivedAt: 'asc' },
    include: { items: true },
  })

  // Same rule as the list endpoint (src/app/api/purchasing/orders/route.ts)
  // — a PO can be paid across multiple installments (DP + final settlement),
  // in any mix of Request Payment/Debit Paid and Reimburse.
  const grandTotal = computePOGrandTotal(order)
  const { paymentStatus, paidTotal, requestedTotal, remaining } = summarizePOPayments(grandTotal, order.paymentRequests, order.reimbursements)

  // Derived label for routed POs — same rule as the list endpoint.
  const currentLegLabel = computeCurrentLegLabel(order)

  return NextResponse.json({
    ...order,
    receipts,
    createdByName,
    requestedByName,
    requestedByOffice,
    requestedByDepartment,
    requestedByRole,
    paymentStatus,
    grandTotal,
    paidTotal,
    requestedTotal,
    remaining,
    currentLegLabel,
    createdBy: undefined,
    items: order.items.map(it => ({ ...it, unit: it.item?.purchaseUnit ?? it.unit ?? null, item: undefined })),
    booking: order.booking ? { bookingCode: order.booking.bookingCode, tripType: order.booking.tripType, leadGuestName: order.booking.customer.name, yacht: order.booking.yacht } : null,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const {
    status, supplierName, expectedAt, notes, dispatchPhotoKey, cancellationReason,
    supplierId, deliveryLocationId, requestedByEmployeeId, items, extraCharges, discountType, discountValue, bookingId, transitStops,
  } = body as {
    status?: string; supplierName?: string; expectedAt?: string; notes?: string; dispatchPhotoKey?: string; cancellationReason?: string
    supplierId?: string; deliveryLocationId?: string; requestedByEmployeeId?: string; bookingId?: string
    items?: { itemId?: string; itemName: string; orderedQty: number; unitCost?: number; unit?: string }[]
    extraCharges?: { label?: string; amount?: number }[]; discountType?: 'PERCENT' | 'FIXED'; discountValue?: number
    transitStops?: string[]
  }

  // Shipping route (transit stops) can only be edited before the PO has been dispatched —
  // once goods are moving, the route is locked in and any repositioning happens via the
  // auto-chained transfers instead (see src/lib/purchasing/transitChain.ts).
  let cleanTransitStopIds: string[] | undefined
  if (transitStops !== undefined) {
    const poForRoute = await db.purchaseOrder.findUnique({ where: { id }, select: { dispatchedAt: true, deliveryLocationId: true } })
    if (!poForRoute) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
    if (poForRoute.dispatchedAt)
      return NextResponse.json({ error: 'Shipping route can no longer be edited after the PO has been dispatched' }, { status: 400 })
    const effectiveDeliveryLocationId = deliveryLocationId !== undefined ? (deliveryLocationId || null) : poForRoute.deliveryLocationId
    cleanTransitStopIds = [...new Set((Array.isArray(transitStops) ? transitStops : []).filter((x): x is string => typeof x === 'string' && !!x))]
    if (effectiveDeliveryLocationId && cleanTransitStopIds.includes(effectiveDeliveryLocationId))
      return NextResponse.json({ error: 'Transit stop tidak boleh sama dengan Delivery Location' }, { status: 400 })
    if (cleanTransitStopIds.length > 0) {
      const validCount = await db.stockLocation.count({ where: { id: { in: cleanTransitStopIds } } })
      if (validCount !== cleanTransitStopIds.length) return NextResponse.json({ error: 'Salah satu transit stop tidak valid' }, { status: 400 })
    }
  }

  // Requested By is mandatory (same as Supplier) — unlike deliveryLocationId, an
  // empty string here isn't a valid "clear" signal, just a rejected edit.
  if (requestedByEmployeeId !== undefined && !requestedByEmployeeId) {
    return NextResponse.json({ error: 'Requested by wajib diisi' }, { status: 400 })
  }

  // Any of these being present means the caller is editing the PO's content (as
  // opposed to just a status transition like Mark In Transit / Cancel).
  const editFieldsTouched = [supplierName, supplierId, deliveryLocationId, requestedByEmployeeId, expectedAt, notes, items, extraCharges, discountType, discountValue, bookingId].some(v => v !== undefined)
  // Items/extraCharges/discount additionally set the PO's financial total — once money
  // has moved against that total (a receipt recorded a receivedQty, or a payment/
  // reimbursement request exists), rewriting them would silently desync
  // GoodsReceiptItem cost history and already-requested/paid amounts from the new
  // total (see computePOGrandTotal/summarizePOPayments) — same reasoning
  // schema.prisma's PurchaseOrder.extraCharges comment already documents for
  // extraCharges alone.
  const financialFieldsTouched = items !== undefined || extraCharges !== undefined || discountType !== undefined || discountValue !== undefined
  if (editFieldsTouched) {
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      select: {
        items: { select: { orderedQty: true, unitCost: true, receivedQty: true } },
        discountType: true, discountValue: true, extraCharges: true,
        paymentRequests: { select: { id: true, amount: true, status: true } },
        reimbursements: { select: { id: true, amount: true, status: true } },
      },
    })
    if (!existing) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

    // Once fully paid, the PO is done — no further edits of any kind (supplier,
    // location, notes, items, ...), only status transitions from here.
    const grandTotal = computePOGrandTotal(existing)
    const { paymentStatus } = summarizePOPayments(grandTotal, existing.paymentRequests, existing.reimbursements)
    if (paymentStatus === 'PAID') {
      return NextResponse.json({ error: 'This PO is already fully paid and can no longer be edited' }, { status: 400 })
    }

    if (financialFieldsTouched) {
      const hasReceipts = existing.items.some(i => i.receivedQty > 0)
      const hasPayments = existing.paymentRequests.length > 0 || existing.reimbursements.length > 0
      if (hasReceipts || hasPayments) {
        return NextResponse.json({ error: 'Items and pricing can no longer be edited — this PO already has receipts or payment records against it' }, { status: 400 })
      }
      if (!items || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })
    }
  }

  // status is optional — when omitted, this just patches supplierName/expectedAt/notes
  // in place without touching status or triggering any status-transition side effects below
  if (status !== undefined) {
    const valid = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']
    if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

    if (status === 'ORDERED' && !supplierName?.trim())
      return NextResponse.json({ error: 'Supplier name is required to confirm PO' }, { status: 400 })

    if (status === 'IN_TRANSIT' && !roleMatches(role, TRANSIT_ALLOWED))
      return NextResponse.json({ error: 'Only purchasing team can mark as In Transit' }, { status: 403 })

    if (status === 'CANCELLED') {
      if (!roleMatches(role, TRANSIT_ALLOWED))
        return NextResponse.json({ error: 'Only purchasing team can cancel a PO' }, { status: 403 })
      if (!cancellationReason?.trim())
        return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
      const existing = await db.purchaseOrder.findUnique({ where: { id }, select: { status: true } })
      if (existing && ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(existing.status))
        return NextResponse.json({ error: 'Cannot cancel a PO that is already in transit or received' }, { status: 400 })
    }
  }

  // Receive permission: based on delivery location's managedBy field
  if (status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED') {
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      select: { deliveryLocation: { select: { managedBy: true } } },
    })
    const managedBy = existing?.deliveryLocation?.managedBy ?? 'WAREHOUSE'
    const receiveAllowed = managedBy === 'PURCHASING'
      ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
      : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
    if (!roleMatches(role, receiveAllowed))
      return NextResponse.json({ error: `Only ${managedBy.toLowerCase()} team can receive items for this delivery location` }, { status: 403 })
  }

  const actingUser = (status === 'IN_TRANSIT' || status === 'CANCELLED' || status === 'ORDERED')
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { name: true } })
    : null

  // supplierId isn't always given explicitly (e.g. a raw API caller, or a free-text
  // supplierName typed without picking a combobox suggestion) — resolve it by name the
  // same way PO creation does, so editing the supplier name keeps the Supplier link in sync.
  let resolvedSupplierId: string | null | undefined = supplierId
  if (resolvedSupplierId === undefined && supplierName !== undefined) {
    const trimmed = supplierName.trim()
    resolvedSupplierId = trimmed
      ? (await db.supplier.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null
      : null
  }

  // Snapshot requester's department/office/role at edit time — same as creation, stays
  // accurate even if the employee's record changes later. requestedByEmployeeId === ''
  // explicitly clears a previously-set requester; undefined leaves it untouched.
  let requesterPatch: Record<string, unknown> | undefined
  if (requestedByEmployeeId !== undefined) {
    if (!requestedByEmployeeId) {
      requesterPatch = { requestedByEmployeeId: null, requestedByName: null, requestedByOffice: null, requestedByDepartment: null, requestedByRole: null }
    } else {
      const requester = await db.employee.findUnique({
        where: { id: requestedByEmployeeId },
        select: { fullName: true, department: true, location: { select: { name: true } }, role: { select: { title: true } } },
      })
      requesterPatch = requester ? {
        requestedByEmployeeId, requestedByName: requester.fullName,
        requestedByOffice: requester.location?.name ?? null, requestedByDepartment: requester.department ?? null, requestedByRole: requester.role?.title ?? null,
      } : undefined
    }
  }

  const cleanExtraCharges = extraCharges !== undefined
    ? extraCharges.map(c => ({ label: String(c.label ?? '').trim(), amount: Number(c.amount) || 0 })).filter(c => c.label || c.amount)
    : undefined
  const cleanDiscountType = discountType === 'PERCENT' || discountType === 'FIXED' ? discountType : (discountType !== undefined ? null : undefined)
  const cleanDiscountValue = discountValue !== undefined ? (cleanDiscountType ? Math.max(0, Number(discountValue) || 0) : 0) : undefined

  const order = await db.$transaction(async tx => {
    if (items) {
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } })
      await tx.purchaseOrderItem.createMany({
        data: items.map(it => ({
          id: crypto.randomUUID(), orderId: id,
          itemId: it.itemId || null, itemName: it.itemName,
          unit: it.itemId ? null : (it.unit?.trim() || null),
          orderedQty: Number(it.orderedQty), unitCost: Number(it.unitCost) || 0,
        })),
      })
    }
    if (cleanTransitStopIds !== undefined) {
      await tx.purchaseOrderTransitStop.deleteMany({ where: { poId: id } })
      if (cleanTransitStopIds.length > 0) {
        await tx.purchaseOrderTransitStop.createMany({
          data: cleanTransitStopIds.map((locationId, idx) => ({ id: crypto.randomUUID(), poId: id, sequence: idx + 1, locationId })),
        })
      }
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(status !== undefined && { status: status as 'DRAFT' | 'ORDERED' | 'IN_TRANSIT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' }),
        ...(supplierName !== undefined && { supplierName: supplierName.trim() || null }),
        ...(resolvedSupplierId !== undefined && { supplierId: resolvedSupplierId }),
        ...(deliveryLocationId !== undefined && { deliveryLocationId: deliveryLocationId || null }),
        ...(bookingId !== undefined && { bookingId: bookingId || null }),
        ...(expectedAt !== undefined && { expectedAt: expectedAt ? new Date(expectedAt) : null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(dispatchPhotoKey !== undefined && { dispatchPhotoKey }),
        ...(cleanExtraCharges !== undefined && { extraCharges: cleanExtraCharges.length > 0 ? cleanExtraCharges : [] }),
        ...(cleanDiscountType !== undefined && { discountType: cleanDiscountType }),
        ...(cleanDiscountValue !== undefined && { discountValue: cleanDiscountValue }),
        ...requesterPatch,
        ...(status === 'ORDERED' && { orderedAt: new Date(), confirmedByName: actingUser?.name ?? null }),
        ...(status === 'IN_TRANSIT' && { dispatchedAt: new Date(), dispatchedByName: actingUser?.name ?? null }),
        ...(status === 'CANCELLED' && {
          cancelledAt: new Date(),
          cancelledByName: actingUser?.name ?? null,
          cancellationReason: (cancellationReason ?? '').trim(),
        }),
        updatedAt: new Date(),
      },
    })
  })

  const poNum = order.poNumber
  const supplier = order.supplierName ?? 'supplier'

  if (status === 'IN_TRANSIT') {
    // Warehouse only cares about POs that actually pass through a warehouse — same rule
    // as the "involves warehouse" filter on their PO list (src/components/purchasing/orders/OrdersPage.tsx).
    // Blasting every PO to every warehouse user (regardless of destination) was noise.
    // Nothing fires at ORDERED — Purchasing confirming a draft PO internally doesn't mean
    // the supplier has even shipped anything yet, so there's nothing for Warehouse to
    // prepare for. The first useful signal is once goods are actually moving.
    const forNotify = await db.purchaseOrder.findUnique({
      where: { id },
      select: {
        deliveryLocation: { select: { type: true } },
        transitStops: { select: { location: { select: { type: true } } } },
      },
    })
    const involvesWarehouse = forNotify?.deliveryLocation?.type === 'WAREHOUSE'
      || !!forNotify?.transitStops.some(s => s.location.type === 'WAREHOUSE')
    const notifyRoles = involvesWarehouse ? ['WAREHOUSE', 'ADMIN'] : ['ADMIN']

    notifyByRole(db, notifyRoles, 'PO_IN_TRANSIT',
      `Barang Dalam Pengiriman`,
      `${poNum} dari ${supplier} sedang dalam perjalanan menuju gudang — harap siapkan penerimaan barang`,
      id,
    ).catch(console.error)
  } else if (status === 'RECEIVED') {
    notifyByRole(db, ['PURCHASING', 'ADMIN'], 'PO_RECEIVED',
      `Barang Diterima`,
      `${poNum} dari ${supplier} telah diterima lengkap`,
      id,
    ).catch(console.error)
  } else if (status === 'PARTIALLY_RECEIVED') {
    notifyByRole(db, ['PURCHASING', 'ADMIN'], 'PO_PARTIALLY_RECEIVED',
      `Barang Diterima Sebagian`,
      `${poNum} dari ${supplier} diterima sebagian — cek detail penerimaan`,
      id,
    ).catch(console.error)
  }

  // Any status change out of (or into) DRAFT moves the "still draft" count, so refresh
  // the sidebar badge live rather than waiting for the next poll.
  if (status !== undefined) emitTenantEvent(session.user.tenantId, 'purchasing-orders')

  return NextResponse.json(order)
}
