import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { defaultTreatmentForType } from '@/lib/purchasing/treatment'
import { baseUnitRatio, rescaleItemBaseQuantities } from '@/lib/purchasing/rescaleItemUnits'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const item = await db.purchaseItem.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { sku, name, type, category, baseUnit, purchaseUnit, conversionFactor, standardCost, sellingPrice, valuationMethod, minStock, minStockUnit, reorderQty, treatment, isActive, imageKey, isSoldInPos, isStockTracked, currentLocationId } = body
  if (!sku || !name || !type || !category || !baseUnit || !purchaseUnit) {
    return NextResponse.json({ error: 'sku, name, type, category, baseUnit and purchaseUnit are required' }, { status: 400 })
  }
  const typeConfig = await db.purchaseItemTypeConfig.findUnique({ where: { code: type } })
  if (!typeConfig || !typeConfig.isActive) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  const skuConflict = await db.purchaseItem.findFirst({ where: { sku: sku.trim().toUpperCase(), NOT: { id } } })
  if (skuConflict) return NextResponse.json({ error: `SKU "${sku}" is already in use` }, { status: 409 })
  const prev = await db.purchaseItem.findUnique({ where: { id }, select: { baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true, sellingPrice: true, minStock: true } })
  if (!prev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const factor = Number(conversionFactor) || 1
  // Base unit changed → existing stock/history is still counted in the old base unit; rescale it.
  const ratio = baseUnitRatio(prev, { baseUnit, purchaseUnit, conversionFactor: factor })
  if (ratio === null) {
    const hasStockData = await db.stockMovement.findFirst({ where: { itemId: id }, select: { id: true } })
      ?? await db.stockLot.findFirst({ where: { itemId: id }, select: { id: true } })
    if (hasStockData) {
      return NextResponse.json({ error: 'This item already has stock history — change the base unit and the purchase unit in two separate saves so existing stock can be converted' }, { status: 409 })
    }
  }
  const r = ratio ?? 1
  // Per-base-unit figures follow the new unit unless the user typed a new value in this save.
  const perBase = (submitted: unknown, old: number, scale: number) => {
    const v = Number(submitted) || 0
    return r !== 1 && v === old ? old * scale : v
  }
  const item = await db.$transaction(async tx => {
    await rescaleItemBaseQuantities(tx, id, r)
    return tx.purchaseItem.update({
      where: { id },
      data: {
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        type,
        category,
        baseUnit,
        purchaseUnit,
        conversionFactor: factor,
        standardCost: perBase(standardCost, prev.standardCost, 1 / r),
        sellingPrice: perBase(sellingPrice, prev.sellingPrice, 1 / r),
        valuationMethod: valuationMethod || 'FIFO',
        minStock: perBase(minStock, prev.minStock, r),
        minStockUnit: minStockUnit === 'PURCHASE' ? 'PURCHASE' : 'BASE',
        ...(treatment !== undefined && { treatment: ['CONSUMABLE', 'ASSET', 'SPARE_PART'].includes(treatment) ? treatment : defaultTreatmentForType(type) }),
        reorderQty: Number(reorderQty) || 0,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        isSoldInPos: isSoldInPos !== undefined ? Boolean(isSoldInPos) : undefined,
        isStockTracked: isStockTracked !== undefined ? Boolean(isStockTracked) : undefined,
        currentLocationId: currentLocationId !== undefined ? (currentLocationId || null) : undefined,
        imageKey: imageKey !== undefined ? (imageKey || null) : undefined,
        updatedAt: new Date(),
      },
    })
  })
  return NextResponse.json(item)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const inUse = await db.stockLot.findFirst({ where: { itemId: id, quantity: { gt: 0 } } })
  if (inUse) return NextResponse.json({ error: 'Item still has stock and cannot be deleted' }, { status: 409 })
  await db.purchaseItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
