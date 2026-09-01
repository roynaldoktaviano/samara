import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { itemRequiresQuotationApproval } from '@/lib/purchasing/quotationApproval'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyByRole, notifyByRoleForRequest } from '@/lib/notify-purchasing'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
// WAREHOUSE sits in VIEW_ALLOWED, which (see GET below) skips the per-request ownership
// check entirely — an existing, wider allowance kept as-is. Crew/Boat Captain/Cruise
// Director are deliberately NOT added here: they must always fall through to the
// ownership/approver check below, since they have no fulfillment role in Purchasing the
// way Warehouse does.
const VIEW_ALLOWED = [...ALLOWED, 'WAREHOUSE']
// Roles that may only ever view/delete their own submissions — never Purchasing's full
// queue. Mirrors OWN_ONLY_ROLES in ../route.ts.
const OWN_ONLY_ROLES = ['WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']
// Roles allowed to call DELETE at all (still subject to the own-draft-only check inside).
const DELETE_ALLOWED = [...VIEW_ALLOWED, 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  const db = await getDb(session)
  const request = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          quotations: { orderBy: { price: 'asc' } },
          quotationApprover: { select: { id: true, name: true } },
          quotationApprovedBy: { select: { id: true, name: true } },
          quotationRejectedBy: { select: { id: true, name: true } },
          verifyRejectedBy: { select: { id: true, name: true } },
        },
      },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      verifiedBy: { select: { id: true, name: true } },
      convertedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      tripBooking: { select: { id: true, bookingCode: true, yacht: { select: { name: true } } } },
      // Lets the frontend show how far conversion got — the detail Timeline fetches each
      // PO's full detail separately (GET /api/purchasing/orders/[id]) for its complete
      // journey, so only enough is needed here to know which POs exist and their status.
      orders: {
        select: { id: true, poNumber: true, status: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!roleMatches(role, VIEW_ALLOWED)) {
    // Warehouse can only open their own requests — not Purchasing's whole queue by id-guessing.
    if (roleMatches(role, OWN_ONLY_ROLES) && request.requestedById === session.user.id) {
      // own submission — allowed straight through
    } else {
      // Not on the Purchasing team and not the requester — still let the PR's assigned
      // approver (any role, e.g. a Boat Captain/Cruise Director or department manager)
      // open it to review before approving.
      const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
      if (!employee || request.approverEmployeeId !== employee.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }
  }

  const itemIds = request.items.map(i => i.itemId).filter(Boolean) as string[]
  const [requesterUser, lots, purchaseItems, warehouses] = await Promise.all([
    db.user.findUnique({ where: { id: request.requestedById }, select: { id: true, name: true } }),
    itemIds.length ? db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }) : ([] as { itemId: string | null; locationId: string; quantity: number }[]),
    itemIds.length ? db.purchaseItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }) : ([] as { id: string; minStock: number; baseUnit: string; purchaseUnit: string; conversionFactor: number }[]),
    db.stockLocation.findMany({ where: { type: 'WAREHOUSE', isActive: true }, select: { id: true, name: true } }),
  ])
  // Requests submitted via the internal Request Order page carry a real requestedByEmployee;
  // prefer that for display, falling back to the ERP user for requests created inside Purchasing.
  const requester = request.requestedByEmployee
    ? { id: request.requestedByEmployee.id, name: `${request.requestedByEmployee.fullName} (${request.requestedByEmployee.employeeNumber})` }
    : requesterUser

  const stockMap = new Map<string, number>()
  const stockByLocationMap = new Map<string, number>() // key: `${itemId}:${locationId}`
  for (const lot of lots) {
    if (!lot.itemId) continue
    stockMap.set(lot.itemId, (stockMap.get(lot.itemId) ?? 0) + lot.quantity)
    const key = `${lot.itemId}:${lot.locationId}`
    stockByLocationMap.set(key, (stockByLocationMap.get(key) ?? 0) + lot.quantity)
  }
  const itemMasterMap = new Map(purchaseItems.map(i => [i.id, i]))
  const warehouseIds = new Set(warehouses.map(w => w.id))
  const warehouseNameMap = new Map(warehouses.map(w => [w.id, w.name]))

  // A Transfer needs a concrete destination other than the source itself — without a
  // delivery location, or when the only warehouse IS the delivery location, no item
  // can be transfer-eligible regardless of stock.
  const canTransfer = !!request.deliveryLocationId

  const items = request.items.map(item => {
    const master = item.itemId ? itemMasterMap.get(item.itemId) : null

    // Convert the requested quantity to base units for comparison against StockLot
    // quantities (which are always denominated in base units) — same conversion used
    // when adding items to a cart in CreateRequestView / the /request-order catalog.
    const requiredBaseQty = master && item.unit === master.purchaseUnit && master.purchaseUnit !== master.baseUnit
      ? item.quantity * (master.conversionFactor || 1)
      : item.quantity

    const warehouseStock = (canTransfer && item.itemId)
      ? [...warehouseIds]
          .filter(locationId => locationId !== request.deliveryLocationId)
          .map(locationId => ({ locationId, qty: stockByLocationMap.get(`${item.itemId}:${locationId}`) ?? 0 }))
          .filter(l => l.qty >= requiredBaseQty)
          .map(l => ({ locationId: l.locationId, locationName: warehouseNameMap.get(l.locationId) ?? '—', qty: l.qty }))
      : []

    return {
      ...item,
      currentStock: item.itemId ? (stockMap.get(item.itemId) ?? 0) : null,
      minStock: master?.minStock ?? 0,
      baseUnit: master?.baseUnit ?? null,
      purchaseUnit: master?.purchaseUnit ?? null,
      conversionFactor: master?.conversionFactor ?? 1,
      warehouseStock,
      transferEligible: warehouseStock.length > 0,
    }
  })

  return NextResponse.json({ ...request, items, requestedBy: requester, createdBy: requesterUser, canTransfer })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const {
    status, transferFulfillments, edit,
    deliveryLocationId, requestedByEmployeeId, notes, neededByDate, isUrgent, urgentReason, items: editItems,
    purpose, tripBookingId,
  } = body as {
    status?: 'DRAFT' | 'ON_PROCESS' | 'CONVERTED' | 'REJECTED' | 'CANCELLED'
    transferFulfillments?: { requestItemId: string; fromLocationId: string }[]
    edit?: boolean
    deliveryLocationId?: string; requestedByEmployeeId?: string; notes?: string
    neededByDate?: string; isUrgent?: boolean; urgentReason?: string
    items?: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string; imageKeys?: string[] }[]
    purpose?: 'STOCK_INVENTORY' | 'TRIP'; tripBookingId?: string
  }

  // Editing a still-DRAFT request — reuses the same validation as creating one (POST
  // /api/purchasing/requests), since the frontend reuses the same form. Only allowed
  // before Verify: once Purchasing has started triaging items (ON_PROCESS+), the item
  // list is no longer a clean slate to overwrite.
  if (edit) {
    const current = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
    if (!current) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (current.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only a request that has not been verified yet can be edited' }, { status: 409 })
    }
    if (!deliveryLocationId) return NextResponse.json({ error: 'Please select a delivery location' }, { status: 400 })
    if (!editItems || !Array.isArray(editItems) || editItems.length === 0) {
      return NextResponse.json({ error: 'Add at least one item to the request' }, { status: 400 })
    }
    for (const it of editItems) {
      if (!it.itemName?.trim()) return NextResponse.json({ error: 'Every item needs a name or description' }, { status: 400 })
      if (!it.quantity || Number(it.quantity) <= 0) return NextResponse.json({ error: `Quantity for "${it.itemName}" must be greater than 0` }, { status: 400 })
    }
    if (isUrgent && !urgentReason?.trim()) {
      return NextResponse.json({ error: 'Please explain why this request is urgent' }, { status: 400 })
    }
    if (purpose && !['STOCK_INVENTORY', 'TRIP'].includes(purpose)) {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
    }
    if (purpose === 'TRIP' && !tripBookingId) {
      return NextResponse.json({ error: 'Please select which trip this request is for' }, { status: 400 })
    }
    const loc = await db.stockLocation.findUnique({ where: { id: deliveryLocationId }, select: { id: true } })
    if (!loc) return NextResponse.json({ error: 'Selected vessel/location was not found' }, { status: 400 })
    if (purpose === 'TRIP' && tripBookingId) {
      const trip = await db.booking.findUnique({ where: { id: tripBookingId }, select: { id: true } })
      if (!trip) return NextResponse.json({ error: 'Selected trip was not found' }, { status: 400 })
    }

    await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
    const updated = await db.purchaseRequest.update({
      where: { id },
      data: {
        deliveryLocationId,
        requestedByEmployeeId: requestedByEmployeeId || null,
        notes: notes?.trim() || null,
        neededByDate: neededByDate ? new Date(neededByDate) : null,
        isUrgent: !!isUrgent,
        urgentReason: isUrgent ? (urgentReason?.trim() || null) : null,
        purpose: purpose === 'TRIP' ? 'TRIP' : 'STOCK_INVENTORY',
        tripBookingId: purpose === 'TRIP' ? (tripBookingId || null) : null,
        updatedAt: new Date(),
        items: {
          create: editItems.map(it => ({
            id: crypto.randomUUID(),
            itemId: it.itemId || null,
            itemName: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            estimatedCost: it.estimatedCost ?? 0,
            supplierId: it.supplierId || null,
            supplierName: it.supplierName || null,
            notes: it.notes || null,
            imageKeys: it.imageKeys ?? [],
          })),
        },
      },
    })
    emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    return NextResponse.json(updated)
  }

  const valid = ['DRAFT', 'ON_PROCESS', 'CONVERTED', 'REJECTED', 'CANCELLED']
  if (!status || !valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  // Which items are actually ready to convert this round. An item blocks itself (not the
  // rest of the PR) when it needs quotation approval (band B+, no known-supplier history)
  // and hasn't gotten it yet, or when nobody has picked a supplier/fulfillment source for
  // it at all yet — pending or rejected are treated the same here: not ready. Already-
  // converted items (a prior partial-convert pass) and items rejected at verify triage
  // are excluded too — a verify-rejected item is a deliberate, permanent exclusion (never
  // ready, never blocking), not a pending approval like the gates below. This lets
  // Purchasing send off whichever items already have a supplier lined up as their own PO
  // right away, instead of waiting on every item in the PR to be settled first.
  let readyItemIds: Set<string> | null = null
  let blockedItemNames: string[] = []
  if (status === 'CONVERTED') {
    const current = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
    if (!current) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (current.status !== 'ON_PROCESS') {
      return NextResponse.json({ error: 'Only a request that is On Process can be converted to a PO' }, { status: 409 })
    }

    const items = await db.purchaseRequestItem.findMany({
      where: { requestId: id },
      select: { id: true, itemId: true, itemName: true, quantity: true, estimatedCost: true, supplierId: true, quotationApprovedAt: true, convertedAt: true, verifyRejectedAt: true },
    })
    const transferItemIds = new Set((transferFulfillments ?? []).map(tf => tf.requestItemId))
    const settled = items.filter(i => i.convertedAt || i.verifyRejectedAt)
    const ready = new Set<string>()
    for (const item of items) {
      if (item.convertedAt || item.verifyRejectedAt) continue // already converted, or rejected at triage — settled, never blocks
      if (!item.supplierId && !transferItemIds.has(item.id)) {
        blockedItemNames.push(item.itemName)
      } else if (item.quotationApprovedAt || !(await itemRequiresQuotationApproval(db, item))) {
        ready.add(item.id)
      } else {
        blockedItemNames.push(item.itemName)
      }
    }
    if (ready.size === 0) {
      return NextResponse.json({
        error: settled.length === items.length
          ? 'All items are already converted or were rejected'
          : `No items are ready to convert yet — supplier selection still needs approval for: ${blockedItemNames.join(', ')}`,
      }, { status: 409 })
    }
    readyItemIds = ready
  }
  // A partial-convert pass (some items still blocked) leaves the request ON_PROCESS —
  // it only reaches CONVERTED once every item has cleared its own approval and been converted.
  const targetStatus = status === 'CONVERTED' && blockedItemNames.length > 0 ? 'ON_PROCESS' : status

  const request = await db.purchaseRequest.update({
    where: { id },
    data: {
      status: targetStatus,
      updatedAt: new Date(),
      ...(status === 'ON_PROCESS' && { verifiedById: session.user.id, verifiedAt: new Date() }),
      ...(targetStatus === 'CONVERTED' && { convertedById: session.user.id, convertedAt: new Date() }),
      ...(status === 'REJECTED' && { rejectedById: session.user.id, rejectedAt: new Date() }),
      ...(status === 'CANCELLED' && { cancelledById: session.user.id, cancelledAt: new Date() }),
    },
    include: { items: true },
  })

  // For items Purchasing chose to fulfill from warehouse stock instead of buying,
  // re-validate stock server-side (never trust client-sent numbers) and route those
  // items to a Transfer instead of a Purchase Order. An item not yet ready (still
  // blocked on quotation approval) is silently skipped here — it stays on the PR for
  // a later convert pass, same as it does on the PO side below.
  const transferByRequestItemId = new Map<string, { fromLocationId: string; baseQty: number }>()
  if (status === 'CONVERTED' && transferFulfillments?.length) {
    if (!request.deliveryLocationId) {
      return NextResponse.json({ error: 'PR tidak punya delivery location — tidak bisa fulfill via transfer' }, { status: 409 })
    }
    const fulfillItemIds = request.items.filter(i => i.itemId).map(i => i.itemId as string)
    const [masters, warehouses] = await Promise.all([
      db.purchaseItem.findMany({ where: { id: { in: fulfillItemIds } }, select: { id: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
      db.stockLocation.findMany({ where: { type: 'WAREHOUSE' }, select: { id: true } }),
    ])
    const masterMap = new Map(masters.map(m => [m.id, m]))
    const warehouseIds = new Set(warehouses.map(w => w.id))

    for (const tf of transferFulfillments) {
      if (readyItemIds && !readyItemIds.has(tf.requestItemId)) continue
      const item = request.items.find(i => i.id === tf.requestItemId)
      if (!item || !item.itemId) return NextResponse.json({ error: 'Item transfer tidak valid' }, { status: 400 })
      if (!warehouseIds.has(tf.fromLocationId) || tf.fromLocationId === request.deliveryLocationId) {
        return NextResponse.json({ error: `Lokasi asal tidak valid untuk "${item.itemName}"` }, { status: 400 })
      }
      const master = masterMap.get(item.itemId)
      const baseQty = master && item.unit === master.purchaseUnit && master.purchaseUnit !== master.baseUnit
        ? item.quantity * (master.conversionFactor || 1)
        : item.quantity
      const lots = await db.stockLot.findMany({ where: { itemId: item.itemId, locationId: tf.fromLocationId }, select: { quantity: true } })
      const available = lots.reduce((s, l) => s + l.quantity, 0)
      if (available < baseQty) {
        return NextResponse.json({ error: `Stok "${item.itemName}" tidak cukup (tersedia: ${available})` }, { status: 409 })
      }
      transferByRequestItemId.set(item.id, { fromLocationId: tf.fromLocationId, baseQty })
    }
  }

  const createdPoNumbers: string[] = []
  const createdPoIds: string[] = []
  // Subset of createdPoNumbers that are brand-new DRAFT POs (not items appended to an
  // existing draft) — used below to notify Purchasing only about drafts that actually
  // need attention for the first time.
  const newDraftPos: { id: string; poNumber: string }[] = []
  const createdTransferNumbers: string[] = []
  // Items actually swept into a PO or Transfer this pass — stamped convertedAt at the end
  // so a later partial-convert pass never re-processes them.
  const processedItemIds = new Set<string>()

  // Auto-create (or append to) draft POs, grouped by supplier, for ready items not
  // fulfilled via transfer. Appending to an existing DRAFT PO for the same supplier
  // (rather than always creating a new one) keeps a trickle of approvals from the same
  // PR from fragmenting into a pile of near-duplicate POs.
  const poItems = readyItemIds ? request.items.filter(item => readyItemIds!.has(item.id) && !transferByRequestItemId.has(item.id)) : []
  if (status === 'CONVERTED' && poItems.length > 0) {
    const requester = request.requestedByEmployeeId
      ? await db.employee.findUnique({
          where: { id: request.requestedByEmployeeId },
          select: { fullName: true, department: true, location: { select: { name: true } }, role: { select: { title: true } } },
        })
      : null

    const prefix = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`

    const groups = new Map<string, typeof request.items>()
    for (const item of poItems) {
      const key = item.supplierId || '__none__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }

    for (const [supplierKey, groupItems] of groups) {
      const supplierId = supplierKey === '__none__' ? null : supplierKey
      const existingDraft = await db.purchaseOrder.findFirst({ where: { requestId: id, status: 'DRAFT', supplierId } })
      const itemsCreate = groupItems.map((it) => ({
        id: crypto.randomUUID(),
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        unit: it.itemId ? null : it.unit,
        orderedQty: it.quantity,
        unitCost: it.estimatedCost,
      }))

      let groupPoId: string
      if (existingDraft) {
        await db.purchaseOrder.update({ where: { id: existingDraft.id }, data: { items: { create: itemsCreate } } })
        createdPoNumbers.push(existingDraft.poNumber)
        createdPoIds.push(existingDraft.id)
        groupPoId = existingDraft.id
      } else {
        const last = await db.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } })
        const seq = last ? (parseInt(last.poNumber.split('-').pop() ?? '0') || 0) + 1 : 1
        const poNumber = `${prefix}${String(seq).padStart(3, '0')}`
        const poId = crypto.randomUUID()
        const supplierName = groupItems[0]?.supplierName ?? null
        await db.purchaseOrder.create({
          data: {
            id: poId,
            poNumber,
            requestId: id,
            supplierId,
            supplierName,
            deliveryLocationId: request.deliveryLocationId,
            status: 'DRAFT',
            createdById: session.user.id,
            updatedAt: new Date(),
            ...(requester && {
              requestedByEmployeeId: request.requestedByEmployeeId,
              requestedByName: requester.fullName,
              requestedByOffice: requester.location?.name ?? null,
              requestedByDepartment: requester.department ?? null,
              requestedByRole: requester.role?.title ?? null,
            }),
            items: { create: itemsCreate },
          },
        })
        createdPoNumbers.push(poNumber)
        createdPoIds.push(poId)
        newDraftPos.push({ id: poId, poNumber })
        groupPoId = poId
      }
      await db.purchaseRequestItem.updateMany({ where: { id: { in: groupItems.map(it => it.id) } }, data: { convertedPoId: groupPoId } })
      for (const it of groupItems) processedItemIds.add(it.id)
    }
  }

  // Create (or append to) Transfers for ready items fulfilled from warehouse stock —
  // grouped by source location, one Transfer per warehouse, destined to the PR's
  // delivery location. Lands as PENDING: warehouse still has to dispatch (with photo)
  // and the destination still has to confirm receipt, same as a manually-created transfer.
  if (status === 'CONVERTED' && transferByRequestItemId.size > 0) {
    const transferGroups = new Map<string, typeof request.items>()
    for (const item of request.items) {
      const tf = transferByRequestItemId.get(item.id)
      if (!tf) continue
      if (!transferGroups.has(tf.fromLocationId)) transferGroups.set(tf.fromLocationId, [])
      transferGroups.get(tf.fromLocationId)!.push(item)
    }

    const trPrefix = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`

    for (const [fromLocationId, groupItems] of transferGroups) {
      const existingTransfer = await db.stockTransfer.findFirst({ where: { purchaseRequestId: id, fromLocationId, status: 'PENDING' } })
      const itemsCreate = groupItems.map(it => ({
        id: crypto.randomUUID(),
        itemId: it.itemId,
        itemName: it.itemName,
        requestedQty: transferByRequestItemId.get(it.id)!.baseQty,
      }))

      if (existingTransfer) {
        await db.stockTransfer.update({ where: { id: existingTransfer.id }, data: { items: { create: itemsCreate } } })
        createdTransferNumbers.push(existingTransfer.transferNumber)
      } else {
        const last = await db.stockTransfer.findFirst({ where: { transferNumber: { startsWith: trPrefix } }, orderBy: { transferNumber: 'desc' }, select: { transferNumber: true } })
        const seq = last ? (parseInt(last.transferNumber.split('-').pop() ?? '0') || 0) + 1 : 1
        const transferNumber = `${trPrefix}${String(seq).padStart(3, '0')}`
        await db.stockTransfer.create({
          data: {
            id: crypto.randomUUID(),
            transferNumber,
            fromLocationId,
            toLocationId: request.deliveryLocationId!,
            purchaseRequestId: id,
            status: 'PENDING',
            notes: `Auto-created from ${request.prNumber}`,
            updatedAt: new Date(),
            items: { create: itemsCreate },
          },
        })
        createdTransferNumbers.push(transferNumber)
      }
      for (const it of groupItems) processedItemIds.add(it.id)
    }
  }

  if (processedItemIds.size > 0) {
    await db.purchaseRequestItem.updateMany({ where: { id: { in: [...processedItemIds] } }, data: { convertedAt: new Date() } })
  }

  // Alert the warehouse the moment a Transfer lands in their queue — they're the one who
  // has to dispatch it next and won't otherwise know a PR conversion just created it.
  if (createdTransferNumbers.length > 0) {
    await notifyByRoleForRequest(db, ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN'], 'TRANSFER_PENDING_DISPATCH',
      'Transfer Baru Menunggu Dikirim',
      `${createdTransferNumbers.join(', ')} dibuat dari ${request.prNumber} — siap dikirim ke lokasi tujuan.`,
      id,
    )
    emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  }

  // Alert Purchasing that a new draft PO is sitting there needing supplier/pricing
  // details filled in before it can be confirmed — otherwise it can go unnoticed until
  // someone happens to open the Purchase Orders list.
  if (newDraftPos.length > 0) {
    for (const po of newDraftPos) {
      await notifyByRole(db, ALLOWED, 'PO_DRAFT_CREATED',
        'Draft PO Menunggu Dilengkapi',
        `${po.poNumber} dibuat dari ${request.prNumber} — lengkapi supplier & harga sebelum dikonfirmasi.`,
        po.id,
      )
    }
    emitTenantEvent(session.user.tenantId, 'purchasing-orders')
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ...request, createdPoNumbers, createdPoIds, createdTransferNumbers, remainingItems: blockedItemNames })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, DELETE_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const existing = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, requestedById: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (roleMatches(role, OWN_ONLY_ROLES) && existing.requestedById !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Hanya PR yang masih Draft yang bisa dihapus' }, { status: 409 })
  await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
  await db.purchaseRequest.delete({ where: { id } })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ok: true })
}
