import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { categoryId, price, isActive, sortOrder } = body as { categoryId?: string; price?: number; isActive?: boolean; sortOrder?: number }

  if (categoryId) {
    const category = await db.posCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }
  if (price !== undefined && Number(price) < 0) return NextResponse.json({ error: 'Price cannot be negative' }, { status: 400 })

  const menuItem = await db.posMenuItem.update({
    where: { id },
    data: {
      ...(categoryId !== undefined && { categoryId }),
      ...(price !== undefined && { price: Number(price) }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
    include: {
      item: { select: { id: true, sku: true, name: true, baseUnit: true, sellingPrice: true, imageKey: true } },
      category: { select: { id: true, name: true } },
      yacht: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(menuItem)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  await db.posMenuItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
