import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

// yachtId query param: 'global' → only Global (yachtId: null) rows.
// a yacht id → that yacht's rows AND Global rows for items it hasn't overridden
// (the yacht-specific row wins when both exist for the same item).
// omitted → everything, for the "all products" overview.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const yachtId = searchParams.get('yachtId')

  const where = yachtId === 'global' ? { yachtId: null } : yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : {}

  const rows = await db.posMenuItem.findMany({
    where,
    include: {
      item: { select: { id: true, sku: true, name: true, baseUnit: true, sellingPrice: true, imageKey: true } },
      category: { select: { id: true, name: true } },
      yacht: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  if (yachtId && yachtId !== 'global') {
    const overriddenItemIds = new Set(rows.filter(r => r.yachtId === yachtId).map(r => r.itemId))
    return NextResponse.json(rows
      .filter(r => r.yachtId === yachtId || !overriddenItemIds.has(r.itemId))
      .map(r => ({ ...r, isOverride: r.yachtId === null && overriddenItemIds.has(r.itemId) })))
  }

  return NextResponse.json(rows.map(r => ({ ...r, isOverride: false })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { itemId, categoryId, yachtId, price } = body as { itemId?: string; categoryId?: string; yachtId?: string | null; price?: number }

  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
  if (!categoryId) return NextResponse.json({ error: 'Please pick a category' }, { status: 400 })
  if (price === undefined || price === null || Number(price) < 0) return NextResponse.json({ error: 'Please set a price' }, { status: 400 })

  const [item, category] = await Promise.all([
    db.purchaseItem.findUnique({ where: { id: itemId }, select: { id: true } }),
    db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } }),
  ])
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const scopeYachtId = yachtId || null
  const existing = await db.posMenuItem.findFirst({ where: { itemId, yachtId: scopeYachtId } })
  if (existing) {
    return NextResponse.json({ error: `Already on ${scopeYachtId ? 'this yacht\'s' : 'the Global'} menu` }, { status: 409 })
  }

  const [menuItem] = await db.$transaction([
    db.posMenuItem.create({
      data: { itemId, categoryId, yachtId: scopeYachtId, price: Number(price) },
      include: {
        item: { select: { id: true, sku: true, name: true, baseUnit: true, sellingPrice: true, imageKey: true } },
        category: { select: { id: true, name: true } },
        yacht: { select: { id: true, name: true } },
      },
    }),
    db.purchaseItem.update({ where: { id: itemId }, data: { isSoldInPos: true } }),
  ])
  return NextResponse.json({ ...menuItem, isOverride: false }, { status: 201 })
}
