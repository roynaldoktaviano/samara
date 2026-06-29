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
  const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [orders, lots, locations, movements, items, exceptions] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { createdAt: { gte: startOf6Months } },
      include: { items: { select: { orderedQty: true, unitCost: true } } },
    }),
    db.stockLot.findMany({ include: { item: { select: { name: true, baseUnit: true, standardCost: true } } } }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true } }),
    db.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item: { select: { name: true, baseUnit: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.purchaseItem.findMany({ select: { id: true, name: true, minStock: true, standardCost: true, baseUnit: true } }),
    db.inventoryException.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
  ])

  const locMap = new Map(locations.map(l => [l.id, l]))

  // ── Enrich RECEIPT movements with supplier name ──
  const grIds = [...new Set(movements.filter(m => m.referenceType === 'GoodsReceipt' && m.referenceId).map(m => m.referenceId!))]
  const goodsReceipts = grIds.length
    ? await db.goodsReceipt.findMany({ where: { id: { in: grIds } }, select: { id: true, order: { select: { supplierName: true } } } })
    : []
  const grSupplierMap = new Map(goodsReceipts.map(gr => [gr.id, gr.order.supplierName]))

  // ── Spending by month ──
  const byMonth: Record<string, { label: string; totalValue: number; poCount: number }> = {}
  for (const o of orders) {
    const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`
    const label = o.createdAt.toLocaleString('id-ID', { month: 'short', year: 'numeric' })
    const value = o.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)
    if (!byMonth[key]) byMonth[key] = { label, totalValue: 0, poCount: 0 }
    byMonth[key].totalValue += value
    byMonth[key].poCount += 1
  }
  const spendingByMonth = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)

  // ── Tab 1: Stock Valuation by Location ──
  const stockByLoc: Record<string, { locationId: string; locationName: string; locationType: string; value: number; itemCount: number; negativeCount: number }> = {}
  for (const lot of lots) {
    const loc = locMap.get(lot.locationId)
    if (!loc) continue
    if (!stockByLoc[lot.locationId]) stockByLoc[lot.locationId] = { locationId: lot.locationId, locationName: loc.name, locationType: loc.type, value: 0, itemCount: 0, negativeCount: 0 }
    if (lot.quantity > 0) {
      stockByLoc[lot.locationId].value += lot.quantity * lot.costPerUnit
      stockByLoc[lot.locationId].itemCount += 1
    }
    if (lot.quantity < 0) stockByLoc[lot.locationId].negativeCount += 1
  }
  const stockValuation = Object.values(stockByLoc).sort((a, b) => b.value - a.value)
  const totalStockValue = stockValuation.reduce((s, l) => s + l.value, 0)

  // ── Tab 2: Expiry / Batch Report ──
  const expiryLots = lots
    .filter(l => l.quantity > 0 && l.expiresAt)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())
    .map(l => ({
      lotId: l.id,
      itemName: l.item.name,
      baseUnit: l.item.baseUnit,
      locationName: locMap.get(l.locationId)?.name ?? '—',
      batch: l.batch,
      quantity: l.quantity,
      costPerUnit: l.costPerUnit,
      value: l.quantity * l.costPerUnit,
      expiresAt: l.expiresAt,
    }))

  // ── Tab 3: Movement Ledger ──
  const movementLedger = movements.map(m => ({
    id: m.id,
    date: m.createdAt,
    itemName: m.item.name,
    baseUnit: m.item.baseUnit,
    type: m.type,
    quantity: m.quantity,
    supplierName: m.referenceId ? (grSupplierMap.get(m.referenceId) ?? null) : null,
    fromLocation: m.fromLocationId ? (locMap.get(m.fromLocationId)?.name ?? m.fromLocationId) : null,
    toLocation: m.toLocationId ? (locMap.get(m.toLocationId)?.name ?? m.toLocationId) : null,
    by: m.createdBy.name,
    notes: m.notes,
  }))

  // ── Tab 5: Exception proxy (low stock items) ──
  const stockTotals = new Map<string, number>()
  for (const lot of lots) {
    if (lot.quantity > 0) stockTotals.set(lot.itemId, (stockTotals.get(lot.itemId) ?? 0) + lot.quantity)
  }
  const lowStockExceptions = items
    .filter(i => i.minStock > 0 && (stockTotals.get(i.id) ?? 0) < i.minStock)
    .map(i => ({
      type: 'Low Stock',
      itemName: i.name,
      locationName: '—',
      currentQty: stockTotals.get(i.id) ?? 0,
      minStock: i.minStock,
      baseUnit: i.baseUnit,
      value: (stockTotals.get(i.id) ?? 0) * i.standardCost,
    }))

  // ── KPI summary ──
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthOrders = orders.filter(o => o.createdAt >= thisMonth)
  const thisMonthSpend = thisMonthOrders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.orderedQty * i.unitCost, 0), 0)

  return NextResponse.json({
    summary: {
      thisMonthSpend,
      thisMonthPOCount: thisMonthOrders.length,
      totalStockValue,
      totalStockLocations: locations.length,
    },
    spendingByMonth,
    stockValuation,
    expiryLots,
    movementLedger,
    lowStockExceptions,
    exceptionRegister: exceptions.map(e => ({
      id: e.id,
      createdAt: e.createdAt,
      type: e.type,
      itemName: e.itemName,
      locationName: e.locationName,
      qty: e.qty,
      value: e.value,
      reason: e.reason,
      status: e.status,
    })),
  })
}
