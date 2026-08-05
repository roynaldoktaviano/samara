import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const request = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      items: { include: { quotations: { orderBy: { price: 'asc' } } } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
      verifiedBy: { select: { id: true, name: true } },
      convertedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  return NextResponse.json({ ...request, items, requestedBy: requester, canTransfer })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { status, transferFulfillments } = body as {
    status: 'DRAFT' | 'ON_PROCESS' | 'CONVERTED' | 'REJECTED' | 'CANCELLED'
    transferFulfillments?: { requestItemId: string; fromLocationId: string }[]
  }
  const valid = ['DRAFT', 'ON_PROCESS', 'CONVERTED', 'REJECTED', 'CANCELLED']
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const request = await db.purchaseRequest.update({
    where: { id },
    data: {
      status,
      updatedAt: new Date(),
      ...(status === 'ON_PROCESS' && { verifiedById: session.user.id, verifiedAt: new Date() }),
      ...(status === 'CONVERTED' && { convertedById: session.user.id, convertedAt: new Date() }),
      ...(status === 'REJECTED' && { rejectedById: session.user.id, rejectedAt: new Date() }),
      ...(status === 'CANCELLED' && { cancelledById: session.user.id, cancelledAt: new Date() }),
    },
    include: { items: true },
  })

  // For items Purchasing chose to fulfill from warehouse stock instead of buying,
  // re-validate stock server-side (never trust client-sent numbers) and route those
  // items to a Transfer instead of a Purchase Order.
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
  const createdTransferNumbers: string[] = []

  // Auto-create draft POs (grouped by supplier) for items not fulfilled via transfer
  const poItems = request.items.filter(item => !transferByRequestItemId.has(item.id))
  if (status === 'CONVERTED') {
    const existingDrafts = await db.purchaseOrder.findFirst({ where: { requestId: id, status: 'DRAFT' } })
    if (!existingDrafts) {
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
        const last = await db.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } })
        const seq = last ? (parseInt(last.poNumber.split('-').pop() ?? '0') || 0) + 1 : 1
        const poNumber = `${prefix}${String(seq).padStart(3, '0')}`
        createdPoNumbers.push(poNumber)
        const supplierId = supplierKey === '__none__' ? null : supplierKey
        const supplierName = groupItems[0]?.supplierName ?? null
        await db.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            poNumber,
            requestId: id,
            supplierId,
            supplierName,
            deliveryLocationId: request.deliveryLocationId,
            status: 'DRAFT',
            createdById: request.requestedById,
            updatedAt: new Date(),
            ...(requester && {
              requestedByEmployeeId: request.requestedByEmployeeId,
              requestedByName: requester.fullName,
              requestedByOffice: requester.location?.name ?? null,
              requestedByDepartment: requester.department ?? null,
              requestedByRole: requester.role?.title ?? null,
            }),
            items: {
              create: groupItems.map((it) => ({
                id: crypto.randomUUID(),
                itemId: it.itemId ?? null,
                itemName: it.itemName,
                unit: it.itemId ? null : it.unit,
                orderedQty: it.quantity,
                unitCost: it.estimatedCost,
              })),
            },
          },
        })
      }
    }
  }

  // Create Transfers for items fulfilled from warehouse stock — grouped by source
  // location, one Transfer per warehouse, destined to the PR's delivery location.
  // Lands as PENDING: warehouse still has to dispatch (with photo) and the
  // destination still has to confirm receipt, same as a manually-created transfer.
  if (status === 'CONVERTED' && transferByRequestItemId.size > 0) {
    const existingTransfers = await db.stockTransfer.findFirst({ where: { purchaseRequestId: id } })
    if (!existingTransfers) {
      const transferGroups = new Map<string, typeof request.items>()
      for (const item of request.items) {
        const tf = transferByRequestItemId.get(item.id)
        if (!tf) continue
        if (!transferGroups.has(tf.fromLocationId)) transferGroups.set(tf.fromLocationId, [])
        transferGroups.get(tf.fromLocationId)!.push(item)
      }

      const trPrefix = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`

      for (const [fromLocationId, groupItems] of transferGroups) {
        const last = await db.stockTransfer.findFirst({ where: { transferNumber: { startsWith: trPrefix } }, orderBy: { transferNumber: 'desc' }, select: { transferNumber: true } })
        const seq = last ? (parseInt(last.transferNumber.split('-').pop() ?? '0') || 0) + 1 : 1
        const transferNumber = `${trPrefix}${String(seq).padStart(3, '0')}`
        createdTransferNumbers.push(transferNumber)
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
            items: {
              create: groupItems.map(it => ({
                id: crypto.randomUUID(),
                itemId: it.itemId,
                itemName: it.itemName,
                requestedQty: transferByRequestItemId.get(it.id)!.baseQty,
              })),
            },
          },
        })
      }
    }
  }

  return NextResponse.json({ ...request, createdPoNumbers, createdTransferNumbers })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const existing = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Hanya PR yang masih Draft yang bisa dihapus' }, { status: 409 })
  await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
  await db.purchaseRequest.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
