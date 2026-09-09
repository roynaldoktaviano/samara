import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
// GET-only: Boat Captain/Cruise Director need the room list to run their own ship's
// Stock Opname — never room/category create/edit.
const VIEW_ALLOWED = [...ALLOWED, 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const locationId = req.nextUrl.searchParams.get('locationId') || undefined

  const rooms = await db.inventoryRoom.findMany({
    where: locationId ? { locationId } : {},
    include: { _count: { select: { categories: true, items: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(rooms)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { name, locationId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })

  const location = await db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true } })
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 400 })

  try {
    const room = await db.inventoryRoom.create({
      data: { id: crypto.randomUUID(), name: name.trim(), locationId, updatedAt: new Date() },
      include: { _count: { select: { categories: true, items: true } } },
    })
    return NextResponse.json(room, { status: 201 })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A room with this name already exists at this location' }, { status: 409 })
    }
    throw e
  }
}
