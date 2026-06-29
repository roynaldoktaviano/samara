import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000)

  const [lots, transfers, exceptions, orders, rawMovements, locations, items] = await Promise.all([
    db.stockLot.findMany({ where: { quantity: { not: 0 } } }),
    db.stockTransfer.findMany({ where: { status: { in: ['PENDING', 'DISPATCHED'] } } }),
    db.inventoryException.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    db.purchaseOrder.findMany({
      where: { status: { notIn: ['RECEIVED', 'CANCELLED'] } },
    }),
    db.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { item: { select: { name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }, createdBy: { select: { name: true } } },
    }),
    db.stockLocation.findMany({ select: { id: true, name: true } }),
    db.purchaseItem.findMany({ select: { id: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }),
  ])

  const locMap = new Map(locations.map(l => [l.id, l.name]))
  const itemMap = new Map(items.map(i => [i.id, i]))

  // KPIs
  const positiveLots = lots.filter(l => l.quantity > 0)
  const totalValue = positiveLots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0)

  const inTransitCount = transfers.filter(t => t.status === 'DISPATCHED').length
  // In-transit value: use stock lots at DISPATCHED transfers (approximate via open transfers)
  const inTransitValue = 0 // StockTransferItem has no unitCost field; leave as 0 or compute separately

  const openExceptions = exceptions.filter(e => e.status === 'OPEN')
  const negativeStock = lots.filter(l => l.quantity < 0).length

  const nearExpiryLots = lots.filter(l =>
    l.quantity > 0 && l.expiresAt && l.expiresAt <= thirtyDaysLater)
  const expiredLots = lots.filter(l => l.quantity > 0 && l.expiresAt && l.expiresAt < now)

  // Value by location (top 8)
  const byLocation: Record<string, number> = {}
  for (const lot of positiveLots) {
    const name = locMap.get(lot.locationId) ?? lot.locationId
    byLocation[name] = (byLocation[name] ?? 0) + lot.quantity * lot.costPerUnit
  }
  const valueByLocation = Object.entries(byLocation)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.slice(0, 14), value }))

  // Control centre
  const overduePOs = orders.filter(o => o.expectedAt && new Date(o.expectedAt) < now)
  const transferDiscrepancies = openExceptions.filter(e => e.type === 'TRANSFER_DISCREPANCY').length
  const negativeExceptions = openExceptions.filter(e => e.type === 'NEGATIVE_STOCK').length

  // Recent movements — resolve location names via locMap
  const recentMovements = rawMovements.map(m => {
    const cf = m.item?.conversionFactor ?? itemMap.get(m.itemId)?.conversionFactor ?? 1
    const purchaseUnit = m.item?.purchaseUnit ?? itemMap.get(m.itemId)?.purchaseUnit ?? null
    const baseUnit = m.item?.baseUnit ?? itemMap.get(m.itemId)?.baseUnit ?? ''
    const hasPurchaseUnit = purchaseUnit && purchaseUnit !== baseUnit && cf > 0
    return {
      id: m.id,
      date: m.createdAt,
      itemName: m.item?.name ?? itemMap.get(m.itemId)?.name ?? '—',
      baseUnit,
      purchaseUnit: hasPurchaseUnit ? purchaseUnit : null,
      purchaseQty: hasPurchaseUnit ? m.quantity / cf : null,
      conversionFactor: cf,
      type: m.type,
      quantity: m.quantity,
      from: m.fromLocationId ? (locMap.get(m.fromLocationId) ?? m.fromLocationId) : null,
      to: m.toLocationId ? (locMap.get(m.toLocationId) ?? m.toLocationId) : null,
      by: m.createdBy?.name ?? null,
    }
  })

  // Expiry watch
  const lotItemIds = [...new Set(nearExpiryLots.map(l => l.itemId))]
  const lotItems = await db.purchaseItem.findMany({ where: { id: { in: lotItemIds } }, select: { id: true, name: true, baseUnit: true } })
  const lotItemMap = new Map(lotItems.map(i => [i.id, i]))

  const expiryWatch = nearExpiryLots
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
    .slice(0, 10)
    .map(l => ({
      id: l.id,
      itemName: lotItemMap.get(l.itemId)?.name ?? '—',
      baseUnit: lotItemMap.get(l.itemId)?.baseUnit ?? '',
      locationName: locMap.get(l.locationId) ?? '—',
      quantity: l.quantity,
      expiresAt: l.expiresAt,
      daysLeft: l.expiresAt ? Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000) : null,
    }))

  return NextResponse.json({
    kpis: {
      totalValue,
      inTransitValue,
      inTransitCount,
      openExceptions: openExceptions.length,
      negativeStock,
      nearExpiry: nearExpiryLots.length,
      expiredCount: expiredLots.length,
    },
    controlCentre: {
      poAwaitingReceipt: orders.filter(o => ['ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(o.status)).length,
      transfersInTransit: inTransitCount,
      negativeStockExceptions: negativeExceptions,
      transferDiscrepancies,
      nearExpiryLots: nearExpiryLots.length,
      overduePOs: overduePOs.length,
    },
    valueByLocation,
    recentMovements,
    expiryWatch,
  })
}
