import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
// CREW included: they can create Purchase Requests and need to browse the Inventory
// picker there (see src/components/purchasing/requests/RequestsPage.tsx) — read-only.
const VIEW_ALLOWED = [...ALLOWED, 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR', 'CREW']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const roomId = req.nextUrl.searchParams.get('roomId') || undefined

  const categories = await db.inventoryCategory.findMany({
    where: roomId ? { roomId } : {},
    include: { _count: { select: { items: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, roomId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!roomId) return NextResponse.json({ error: 'roomId is required' }, { status: 400 })

  const room = await db.inventoryRoom.findUnique({ where: { id: roomId }, select: { id: true } })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 400 })

  try {
    const category = await db.inventoryCategory.create({
      data: { id: crypto.randomUUID(), name: name.trim(), roomId, updatedAt: new Date() },
      include: { _count: { select: { items: true } } },
    })
    return NextResponse.json(category, { status: 201 })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A category with this name already exists in this room' }, { status: 409 })
    }
    throw e
  }
}
