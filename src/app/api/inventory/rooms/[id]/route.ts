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
    const room = await db.inventoryRoom.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: { _count: { select: { categories: true, items: true } } },
    })
    return NextResponse.json(room)
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A room with this name already exists at this location' }, { status: 409 })
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

  const room = await db.inventoryRoom.findUnique({
    where: { id },
    select: { _count: { select: { categories: true, items: true } } },
  })
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (room._count.categories > 0 || room._count.items > 0) {
    return NextResponse.json({ error: 'This room still has categories/items, cannot be deleted' }, { status: 409 })
  }

  await db.inventoryRoom.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
