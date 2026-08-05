import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

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
      locEntry.rows.set(lot.itemId, { kind: 'stock', item, qty: 0, costPerUnit: lot.costPerUnit, lotsCount: 0, nearestExpiry: null })
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
