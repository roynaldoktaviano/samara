import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

const INCLUDE = {
  category: { select: { id: true, name: true } },
  yacht: { select: { id: true, name: true } },
  items: { include: { item: { select: { id: true, name: true, baseUnit: true } } } },
} as const

// Unlike menu items, a package has no single PurchaseItem identity to key an
// override off of — a yacht's effective package list is simply Global ∪ its own.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const yachtId = searchParams.get('yachtId')
  const where = yachtId === 'global' ? { yachtId: null } : yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : {}

  const rows = await db.posPackage.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, description, categoryId, yachtId, price, imageKey, items } = body as {
    name?: string; description?: string; categoryId?: string; yachtId?: string | null; price?: number; imageKey?: string | null
    items?: { itemId: string; qty: number }[]
  }

  if (!name?.trim()) return NextResponse.json({ error: 'Package name is required' }, { status: 400 })
  if (!categoryId) return NextResponse.json({ error: 'Please pick a category' }, { status: 400 })
  if (price === undefined || price === null || Number(price) < 0) return NextResponse.json({ error: 'Please set a price' }, { status: 400 })
  if (!items || items.length === 0) return NextResponse.json({ error: 'Add at least one item to the package' }, { status: 400 })

  const category = await db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const pkg = await db.posPackage.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      categoryId,
      yachtId: yachtId || null,
      price: Number(price),
      imageKey: imageKey || null,
      items: { create: items.map(it => ({ itemId: it.itemId, qty: Number(it.qty) || 1 })) },
    },
    include: INCLUDE,
  })
  return NextResponse.json(pkg, { status: 201 })
}
