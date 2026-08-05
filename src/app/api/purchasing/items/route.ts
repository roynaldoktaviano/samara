import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [items, lots] = await Promise.all([
    db.purchaseItem.findMany({ orderBy: [{ type: 'asc' }, { category: 'asc' }, { name: 'asc' }] }),
    db.stockLot.findMany({ where: { quantity: { gt: 0 } }, select: { itemId: true, quantity: true, costPerUnit: true } }),
  ])

  // Aggregate total stock and weighted avg price per item — custom (non-catalog)
  // PO items have no PurchaseItem row to attach this to, so they're excluded.
  const stockMap = new Map<string, { totalQty: number; totalValue: number }>()
  for (const lot of lots) {
    if (!lot.itemId) continue
    const cur = stockMap.get(lot.itemId) ?? { totalQty: 0, totalValue: 0 }
    stockMap.set(lot.itemId, {
      totalQty: cur.totalQty + lot.quantity,
      totalValue: cur.totalValue + lot.quantity * lot.costPerUnit,
    })
  }

  return NextResponse.json(items.map(item => {
    const agg = stockMap.get(item.id)
    const totalQty = agg?.totalQty ?? 0
    const avgPrice = totalQty > 0 ? (agg!.totalValue / totalQty) : 0
    return { ...item, totalQty, avgPrice }
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { sku, name, type, category, baseUnit, purchaseUnit, conversionFactor, standardCost, sellingPrice, valuationMethod, minStock, reorderQty, imageKey, isSoldInPos } = body
  if (!sku || !name || !type || !category || !baseUnit || !purchaseUnit) {
    return NextResponse.json({ error: 'sku, name, type, category, baseUnit, purchaseUnit wajib diisi' }, { status: 400 })
  }
  const typeConfig = await db.purchaseItemTypeConfig.findUnique({ where: { code: type } })
  if (!typeConfig || !typeConfig.isActive) {
    return NextResponse.json({ error: 'type tidak valid' }, { status: 400 })
  }
  const existing = await db.purchaseItem.findUnique({ where: { sku } })
  if (existing) return NextResponse.json({ error: `SKU "${sku}" sudah digunakan` }, { status: 409 })
  const item = await db.purchaseItem.create({
    data: {
      id: crypto.randomUUID(),
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      type,
      category,
      baseUnit,
      purchaseUnit,
      conversionFactor: Number(conversionFactor) || 1,
      standardCost: Number(standardCost) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      valuationMethod: valuationMethod || 'FIFO',
      minStock: Number(minStock) || 0,
      reorderQty: Number(reorderQty) || 0,
      imageKey: imageKey || null,
      isSoldInPos: isSoldInPos !== undefined ? Boolean(isSoldInPos) : true,
      updatedAt: new Date(),
    },
  })
  return NextResponse.json(item, { status: 201 })
}
