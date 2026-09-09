import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, isActive } = await req.json()
  if (name !== undefined && !name?.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })

  try {
    const category = await db.inventoryCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: { _count: { select: { items: true } } },
    })
    return NextResponse.json(category)
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A category with this name already exists in this room' }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const category = await db.inventoryCategory.findUnique({ where: { id }, select: { _count: { select: { items: true } } } })
  if (!category) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (category._count.items > 0) {
    return NextResponse.json({ error: 'This category still has items, cannot be deleted' }, { status: 409 })
  }

  await db.inventoryCategory.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
