import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const yachtId = searchParams.get('yachtId')
  if (!yachtId) return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })

  const location = await withRetry(db, () => db.stockLocation.findFirst({
    where: { yachtId, type: 'VESSEL', isActive: true },
    select: { id: true },
  }))
  if (!location) return NextResponse.json({ error: 'No vessel stock location for this yacht' }, { status: 404 })

  const now = new Date()
  const [menuRows, packageRows, discountRows, lots] = await Promise.all([
    withRetry(db, () => db.posMenuItem.findMany({
      where: { isActive: true, OR: [{ yachtId }, { yachtId: null }] },
      include: {
        item: { select: { id: true, name: true, baseUnit: true, imageKey: true } },
        category: { select: { id: true, name: true, sortOrder: true } },
      },
    })),
    withRetry(db, () => db.posPackage.findMany({
      where: { isActive: true, OR: [{ yachtId }, { yachtId: null }] },
      include: {
        category: { select: { id: true, name: true, sortOrder: true } },
        items: { include: { item: { select: { name: true } } } },
      },
    })),
    withRetry(db, () => db.posDiscount.findMany({
      where: {
        isActive: true,
        OR: [{ yachtId }, { yachtId: null }],
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: { name: 'asc' },
    })),
    withRetry(db, () => db.stockLot.findMany({
      where: { locationId: location.id },
      select: { itemId: true, quantity: true },
    })),
  ])

  const stockMap = new Map<string, number>()
  for (const lot of lots) {
    if (!lot.itemId) continue
    stockMap.set(lot.itemId, (stockMap.get(lot.itemId) ?? 0) + lot.quantity)
  }

  // Yacht-specific PosMenuItem overrides a Global one for the same catalog item.
  const yachtItemIds = new Set(menuRows.filter(r => r.yachtId === yachtId).map(r => r.itemId))
  const effectiveMenuRows = menuRows.filter(r => r.yachtId === yachtId || !yachtItemIds.has(r.itemId))

  const categoryMap = new Map<string, { id: string; name: string; sortOrder: number }>()
  for (const r of effectiveMenuRows) categoryMap.set(r.category.id, r.category)
  for (const p of packageRows) categoryMap.set(p.category.id, p.category)
  const categories = Array.from(categoryMap.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const items = effectiveMenuRows
    .map(r => ({
      kind: 'item' as const,
      id: r.item.id,
      name: r.item.name,
      unit: r.item.baseUnit,
      imageKey: r.item.imageKey,
      price: r.price,
      categoryId: r.category.id,
      categoryName: r.category.name,
      stock: stockMap.get(r.item.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const packages = packageRows
    .map(p => ({
      kind: 'package' as const,
      id: p.id,
      name: p.name,
      description: p.description,
      imageKey: p.imageKey,
      price: p.price,
      categoryId: p.category.id,
      categoryName: p.category.name,
      components: p.items.map(it => ({ name: it.item.name, qty: it.qty })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    locationId: location.id,
    categories,
    items,
    packages,
    discounts: discountRows.map(d => ({ id: d.id, name: d.name, type: d.type, value: d.value })),
  })
}
