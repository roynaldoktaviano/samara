import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { nextVal } from '@/lib/counter'

const OPNAME_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const opnames = await db.inventoryOpname.findMany({
    include: {
      location: { select: { id: true, name: true, type: true } },
      room: { select: { id: true, name: true } },
      countedBy: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(opnames)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { locationId, roomId, notes } = await req.json()
  if (!locationId) return NextResponse.json({ error: 'Please select a ship/location first' }, { status: 400 })
  if (!roomId) return NextResponse.json({ error: 'Please select a room first' }, { status: 400 })

  const room = await db.inventoryRoom.findUnique({ where: { id: roomId }, select: { id: true, locationId: true } })
  if (!room || room.locationId !== locationId) return NextResponse.json({ error: 'Room not found at this location' }, { status: 400 })

  const items = await db.inventoryItem.findMany({ where: { roomId, isActive: true } })
  if (items.length === 0) {
    return NextResponse.json({ error: 'There are no active items in this room to count' }, { status: 400 })
  }

  const opnameNumber = 'INVOP-' + String(await nextVal('inventory-opname', db)).padStart(4, '0')

  const opname = await db.inventoryOpname.create({
    data: {
      id: crypto.randomUUID(),
      opnameNumber,
      locationId,
      roomId,
      notes: notes?.trim() || null,
      countedById: session.user.id,
      updatedAt: new Date(),
      entries: {
        create: items.flatMap(item =>
          Array.from({ length: Math.max(1, item.quantity) }, (_, i) => ({
            id: crypto.randomUUID(),
            itemId: item.id,
            unitIndex: i + 1,
          }))
        ),
      },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      room: { select: { id: true, name: true } },
      countedBy: { select: { id: true, name: true } },
      entries: { include: { item: { select: { id: true, itemNumber: true, name: true, unitPrice: true } } } },
    },
  })

  return NextResponse.json(opname, { status: 201 })
}
