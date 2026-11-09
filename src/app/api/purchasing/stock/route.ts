import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { toBaseQty } from '@/lib/purchasing/transferActions'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')

  const [lots, items, locations] = await Promise.all([
    db.stockLot.findMany({ where: { quantity: { gt: 0 }, ...(locationId ? { locationId } : {}) } }),
    db.purchaseItem.findMany({ select: { id: true, sku: true, name: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, minStock: true, valuationMethod: true } }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true, yachtId: true } }),
  ])

  const itemMap = new Map(items.map(i => [i.id, i]))
  const locMap  = new Map(locations.map(l => [l.id, l]))
  const warehouseIds = locations.filter(l => l.type === 'WAREHOUSE').map(l => l.id)

  // Replenishment pipeline per item+warehouse (base units), same sources as stockCheck's On Order:
  //   Pending = sent to Purchasing, not yet on a PO (open PR lines headed to that warehouse —
  //             a PR delivered to it, or a restock line for it)
  //   PO      = on an open PO delivered to it, not yet received
  //   To Be Order = Min. Stock − Stock − Pending − PO (≥ 0), so the number moves
  //             To Be Order → Pending → PO → Stock as the restock progresses.
  const [openPrLines, openPoLines, emptyLots] = warehouseIds.length ? await Promise.all([
    db.purchaseRequestItem.findMany({
      where: {
        itemId: { not: null }, convertedAt: null, verifyRejectedAt: null,
        request: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ON_PROCESS'] } },
        OR: [{ restockLocationId: { in: warehouseIds } }, { restockLocationId: null, request: { deliveryLocationId: { in: warehouseIds } } }],
      },
      select: { itemId: true, quantity: true, unit: true, restockLocationId: true, request: { select: { deliveryLocationId: true } } },
    }),
    db.purchaseOrderItem.findMany({
      where: { itemId: { not: null }, order: { status: { in: ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'] }, deliveryLocationId: { in: warehouseIds } } },
      select: { itemId: true, orderedQty: true, receivedQty: true, order: { select: { deliveryLocationId: true } } },
    }),
    // Items that ran out at a warehouse still need a row (that's exactly when they need ordering).
    db.stockLot.findMany({
      where: { quantity: { lte: 0 }, itemId: { not: null }, locationId: { in: locationId ? [locationId] : warehouseIds } },
      select: { itemId: true, locationId: true }, distinct: ['itemId', 'locationId'],
    }),
  ]) : [[], [], []]
  const pendingMap = new Map<string, number>()
  const poMap = new Map<string, number>()
  const addTo = (map: Map<string, number>, key: string, qty: number) => map.set(key, (map.get(key) ?? 0) + qty)
  for (const l of openPrLines) {
    const to = l.restockLocationId ?? l.request.deliveryLocationId
    if (!l.itemId || !to) continue
    addTo(pendingMap, `${l.itemId}:${to}`, toBaseQty(l.quantity, l.unit, itemMap.get(l.itemId)))
  }
  for (const l of openPoLines) {
    if (!l.itemId || !l.order.deliveryLocationId) continue
    // PO lines are in purchase units — receiveGoods() multiplies by conversionFactor too.
    addTo(poMap, `${l.itemId}:${l.order.deliveryLocationId}`, Math.max(0, l.orderedQty - l.receivedQty) * (itemMap.get(l.itemId)?.conversionFactor || 1))
  }

  const sourcePoIds = [...new Set(lots.map(l => l.sourcePoId).filter((id): id is string => id !== null))]
  const sourcePos = sourcePoIds.length
    ? await db.purchaseOrder.findMany({ where: { id: { in: sourcePoIds } }, select: { id: true, poNumber: true } })
    : []
  const poNumberMap = new Map(sourcePos.map(o => [o.id, o.poNumber]))

  // "Stock item" rows (catalog, itemId set) merge across lots into one running
  // balance per item+location — stock is fungible, so which PO/receipt any
  // given unit came from isn't tracked once it joins the pile.
  //
  // "Non-stock item" rows (itemId null — one-off PO purchases like "Grab" or
  // event flowers) are the opposite: each receipt got its own untouched lot
  // (see receipts/route.ts), so every row here maps 1:1 to a lot and stays
  // traceable to exactly the PO, arrival date, and cost that brought it in.
  type CatalogItem = (typeof items)[0]
  type StockRow = {
    kind: 'stock'
    item: CatalogItem
    qty: number
    costPerUnit: number
    lotsCount: number
    nearestExpiry: Date | null
    replenish: { toBeOrder: number; pending: number; po: number } | null
  }
  type NonStockRow = {
    kind: 'non-stock'
    id: string
    itemName: string
    unit: string | null
    qty: number
    costPerUnit: number
    sourcePoId: string | null
    poNumber: string | null
    receivedAt: Date
  }
  type Row = StockRow | NonStockRow
  const byLocation = new Map<string, { location: (typeof locations)[0]; rows: Map<string, StockRow>; nonStockRows: NonStockRow[] }>()

  for (const lot of lots) {
    const loc = locMap.get(lot.locationId)
    if (!loc) continue
    if (!byLocation.has(lot.locationId)) byLocation.set(lot.locationId, { location: loc, rows: new Map(), nonStockRows: [] })
    const locEntry = byLocation.get(lot.locationId)!

    if (!lot.itemId) {
      locEntry.nonStockRows.push({
        kind: 'non-stock',
        id: lot.id,
        itemName: lot.itemName ?? 'Unnamed item',
        unit: lot.unit,
        qty: lot.quantity,
        costPerUnit: lot.costPerUnit,
        sourcePoId: lot.sourcePoId,
        poNumber: lot.sourcePoId ? (poNumberMap.get(lot.sourcePoId) ?? null) : null,
        receivedAt: lot.createdAt,
      })
      continue
    }

    const item = itemMap.get(lot.itemId)
    if (!item) continue
    if (!locEntry.rows.has(lot.itemId)) {
      locEntry.rows.set(lot.itemId, { kind: 'stock', item, qty: 0, costPerUnit: lot.costPerUnit, lotsCount: 0, nearestExpiry: null, replenish: null })
    }
    const row = locEntry.rows.get(lot.itemId)!
    row.qty += lot.quantity
    row.lotsCount += 1
    // Weighted average cost
    row.costPerUnit = row.qty > 0 ? (row.costPerUnit * (row.qty - lot.quantity) + lot.costPerUnit * lot.quantity) / row.qty : lot.costPerUnit
    // Nearest expiry
    if (lot.expiresAt) {
      if (!row.nearestExpiry || lot.expiresAt < row.nearestExpiry) row.nearestExpiry = lot.expiresAt
    }
  }

  // Zero-stock rows at warehouses: item ran out there, or is already pending / on a PO to it.
  const zeroKeys = new Set<string>([
    ...emptyLots.map(l => `${l.itemId}:${l.locationId}`),
    ...pendingMap.keys(), ...poMap.keys(),
  ])
  for (const key of zeroKeys) {
    const [itemId, locId] = key.split(':')
    if (locationId && locId !== locationId) continue
    const item = itemMap.get(itemId)
    const loc = locMap.get(locId)
    if (!item || !loc) continue
    if (!byLocation.has(locId)) byLocation.set(locId, { location: loc, rows: new Map(), nonStockRows: [] })
    const locEntry = byLocation.get(locId)!
    if (!locEntry.rows.has(itemId)) locEntry.rows.set(itemId, { kind: 'stock', item, qty: 0, costPerUnit: 0, lotsCount: 0, nearestExpiry: null, replenish: null })
  }

  // Replenishment numbers only make sense where Min. Stock is kept — the warehouses.
  for (const { location, rows } of byLocation.values()) {
    if (location.type !== 'WAREHOUSE') continue
    for (const row of rows.values()) {
      const key = `${row.item.id}:${location.id}`
      const pending = pendingMap.get(key) ?? 0
      const po = poMap.get(key) ?? 0
      row.replenish = { pending, po, toBeOrder: Math.max(0, row.item.minStock - row.qty - pending - po) }
    }
  }

  const locationsOut = Array.from(byLocation.values())
    .map(({ location, rows, nonStockRows }) => ({
      location,
      rows: [...Array.from(rows.values()), ...nonStockRows.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())] as Row[],
    }))
    .sort((a, b) => a.location.name.localeCompare(b.location.name))

  const allRows = locationsOut.flatMap(l => l.rows)
  const stockRows = allRows.filter((r): r is StockRow => r.kind === 'stock')
  return NextResponse.json({
    locations: locationsOut,
    summary: {
      totalItems: allRows.length,
      lowStock: stockRows.filter(r => r.item.minStock > 0 && r.qty < r.item.minStock).length,
    },
  })
}
