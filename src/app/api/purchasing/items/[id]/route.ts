import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { defaultTreatmentForType } from '@/lib/purchasing/treatment'

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
  const item = await db.purchaseItem.update({
    where: { id },
    data: {
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
