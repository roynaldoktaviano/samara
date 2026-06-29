import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const now = new Date()

  const [lots, items, locations, orders, movements, register] = await Promise.all([
    db.stockLot.findMany(),
    db.purchaseItem.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, category: true, baseUnit: true, minStock: true, reorderQty: true } }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true } }),
    db.purchaseOrder.findMany({
      where: { status: { in: ['ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'] } },
      include: { items: { select: { itemName: true, orderedQty: true, receivedQty: true } } },
    }),
    db.stockMovement.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
      select: { itemId: true, createdAt: true },
    }),
    db.inventoryException.findMany({
      orderBy: { createdAt: 'desc' },
      include: { resolvedBy: { select: { id: true, name: true } } },
    }),
  ])

  const itemMap = new Map(items.map(i => [i.id, i]))
  const locMap = new Map(locations.map(l => [l.id, l]))

  // Aggregate qty per item across all locations
  const stockByItem = new Map<string, number>()
  for (const lot of lots) {
    stockByItem.set(lot.itemId, (stockByItem.get(lot.itemId) ?? 0) + lot.quantity)
  }

  // 1. Low stock
  const lowStock: object[] = []
  for (const [itemId, totalQty] of stockByItem) {
    const item = itemMap.get(itemId)
    if (!item || item.minStock <= 0) continue
    if (totalQty < item.minStock) {
      const severity = totalQty === 0 ? 'critical' : totalQty < item.minStock * 0.5 ? 'high' : 'medium'
      lowStock.push({ item, totalQty, minStock: item.minStock, reorderQty: item.reorderQty, deficit: item.minStock - totalQty, severity })
    }
  }
  // Items with minStock but no stock at all
  for (const item of items) {
    if (item.minStock > 0 && !stockByItem.has(item.id)) {
      lowStock.push({ item, totalQty: 0, minStock: item.minStock, reorderQty: item.reorderQty, deficit: item.minStock, severity: 'critical' })
    }
  }

  // 2. Overdue POs
  const overduePOs = orders
    .filter(o => o.expectedAt && o.expectedAt < now)
    .map(o => ({
      id: o.id, poNumber: o.poNumber, supplierName: o.supplierName,
      status: o.status, expectedAt: o.expectedAt,
      daysOverdue: Math.floor((now.getTime() - o.expectedAt!.getTime()) / (1000 * 60 * 60 * 24)),
      itemCount: o.items.length,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  // 3. Items with no movement in 30 days but have stock
  const recentItemIds = new Set(movements.map(m => m.itemId))
  const staleStock = lots
    .filter(lot => lot.quantity > 0 && !recentItemIds.has(lot.itemId))
    .map(lot => ({
      item: itemMap.get(lot.itemId),
      location: locMap.get(lot.locationId),
      qty: lot.quantity,
    }))
    .filter(s => s.item && s.location)
    .slice(0, 20)

  const openExceptions = register.filter(e => e.status === 'OPEN')

  return NextResponse.json({
    register,
    lowStock: lowStock.sort((a: any, b: any) => {
      const order = { critical: 0, high: 1, medium: 2 }
      return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order]
    }),
    overduePOs,
    staleStock,
    summary: {
      openExceptions: openExceptions.length,
      lowStockCount: lowStock.length,
      criticalCount: lowStock.filter((s: any) => s.severity === 'critical').length,
      overduePOCount: overduePOs.length,
      staleStockCount: staleStock.length,
    },
  })
}
