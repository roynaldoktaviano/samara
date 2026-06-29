import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const item = await db.purchaseItem.findUnique({ where: { id }, select: { valuationMethod: true, standardCost: true, baseUnit: true, purchaseUnit: true } })

  const [movements, receiptItems, orderItems, stockLots, locations] = await Promise.all([
    db.stockMovement.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { createdBy: { select: { name: true } } },
    }),
    db.goodsReceiptItem.findMany({
      where: { itemId: id },
      include: {
        receipt: {
          include: {
            order: { select: { id: true, poNumber: true, supplierName: true } },
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { receipt: { receivedAt: 'desc' } },
    }),
    db.purchaseOrderItem.findMany({
      where: { itemId: id },
      select: { orderId: true, unitCost: true },
    }),
    db.stockLot.findMany({
      where: { itemId: id, quantity: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true } }),
  ])

  const locMap = new Map(locations.map(l => [l.id, l]))
  const orderCostMap = new Map(orderItems.map(oi => [oi.orderId, oi.unitCost]))

  // GR IDs that are already shown as RECEIVE entries — skip their RECEIPT stock movements
  const grIds = new Set(receiptItems.map(ri => ri.receipt.id))

  const baseUnit = item?.baseUnit ?? ''
  const purchaseUnit = item?.purchaseUnit ?? baseUnit

  // Build timeline: merge movements + receipts, sorted by date desc
  const timeline = [
    ...movements
      .filter(m => !(m.type === 'RECEIPT' && m.referenceType === 'GoodsReceipt' && m.referenceId && grIds.has(m.referenceId)))
      .map(m => ({
        id: m.id,
        date: m.createdAt,
        type: m.type,
        qty: m.quantity,
        unit: baseUnit,
        fromLocation: m.fromLocationId ? locMap.get(m.fromLocationId)?.name ?? null : null,
        toLocation: m.toLocationId ? locMap.get(m.toLocationId)?.name ?? null : null,
        notes: m.notes,
        by: m.createdBy.name,
        unitCost: null as number | null,
        supplier: null as string | null,
        poNumber: null as string | null,
        grNumber: null as string | null,
      })),
    ...receiptItems.map(ri => ({
      id: ri.id,
      date: ri.receipt.receivedAt,
      type: 'RECEIVE' as const,
      qty: ri.receivedQty,
      unit: purchaseUnit,
      fromLocation: null,
      toLocation: ri.receipt.location.name,
      notes: ri.receipt.notes,
      by: null,
      unitCost: orderCostMap.get(ri.receipt.order.id) ?? null,
      supplier: ri.receipt.order.supplierName,
      poNumber: ri.receipt.order.poNumber,
      grNumber: ri.receipt.grNumber,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const currentStock = stockLots.map(lot => ({
    locationId: lot.locationId,
    locationName: locMap.get(lot.locationId)?.name ?? '—',
    locationType: locMap.get(lot.locationId)?.type ?? '—',
    qty: lot.quantity,
    costPerUnit: lot.costPerUnit,
  }))

  const lots = stockLots.map(lot => ({
    id: lot.id,
    locationId: lot.locationId,
    locationName: locMap.get(lot.locationId)?.name ?? '—',
    quantity: lot.quantity,
    costPerUnit: lot.costPerUnit,
    batch: lot.batch,
    expiresAt: lot.expiresAt,
    createdAt: lot.createdAt,
  }))

  return NextResponse.json({
    timeline,
    currentStock,
    lots,
    valuationMethod: item?.valuationMethod ?? 'FIFO',
    standardCost: item?.standardCost ?? 0,
    baseUnit,
    purchaseUnit,
  })
}
