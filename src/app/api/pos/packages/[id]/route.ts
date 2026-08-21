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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const pkg = await db.posPackage.findUnique({ where: { id }, include: INCLUDE })
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pkg)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, description, categoryId, yachtId, price, imageKey, isActive, sortOrder, items } = body as {
    name?: string; description?: string; categoryId?: string; yachtId?: string | null; price?: number; imageKey?: string | null
    isActive?: boolean; sortOrder?: number; items?: { itemId: string; qty: number }[]
  }

  if (name !== undefined && !name.trim()) return NextResponse.json({ error: 'Package name is required' }, { status: 400 })
  if (price !== undefined && Number(price) < 0) return NextResponse.json({ error: 'Price cannot be negative' }, { status: 400 })
  if (items !== undefined && items.length === 0) return NextResponse.json({ error: 'A package needs at least one item' }, { status: 400 })
  if (categoryId) {
    const category = await db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  if (items !== undefined) await db.posPackageItem.deleteMany({ where: { packageId: id } })

  const pkg = await db.posPackage.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(categoryId !== undefined && { categoryId }),
      ...(yachtId !== undefined && { yachtId: yachtId || null }),
      ...(price !== undefined && { price: Number(price) }),
      ...(imageKey !== undefined && { imageKey: imageKey || null }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(items !== undefined && { items: { create: items.map(it => ({ itemId: it.itemId, qty: Number(it.qty) || 1 })) } }),
    },
    include: INCLUDE,
  })
  return NextResponse.json(pkg)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  await db.posPackage.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
