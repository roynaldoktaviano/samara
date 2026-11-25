import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { crewScopeYachtId } from '@/lib/purchasing/yachtScope'

// CREW: own yacht's locations only, and can't approve (see [id]/route.ts).
const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'CREW']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const crewYachtId = await crewScopeYachtId(db, role, session.user.id)
  const counts = await db.stockCount.findMany({
    where: crewYachtId ? { location: { yachtId: crewYachtId } } : undefined,
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(counts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { locationId, notes, countedById: bodyCountedById } = await req.json()
  if (!locationId) return NextResponse.json({ error: 'Location is required' }, { status: 400 })
  const crewYachtId = await crewScopeYachtId(db, role, session.user.id)
  if (crewYachtId) {
    const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { yachtId: true } })
    if (loc?.yachtId !== crewYachtId) return NextResponse.json({ error: 'Crew accounts can only count their own yacht' }, { status: 403 })
  }
  const countedById = crewYachtId ? session.user.id : (bodyCountedById ?? session.user.id)

  // Build count number — highest numeric SC-#### so far. The table also holds Stock Opname
  // Awal rows (ISO-####), and taking just the newest row produced "SC-0NaN" (and then a
  // unique-constraint failure on the next count).
  const scNumbers = await db.stockCount.findMany({ where: { countNumber: { startsWith: 'SC-' } }, select: { countNumber: true } })
  const lastNum = scNumbers.reduce((max, c) => {
    const n = /^SC-(\d+)$/.exec(c.countNumber)
    return n ? Math.max(max, Number(n[1])) : max
  }, 0)
  const countNumber = `SC-${String(lastNum + 1).padStart(4, '0')}`

  // Load current stock at this location
  const lots = await db.stockLot.findMany({
    where: { locationId, quantity: { gt: 0 } },
    include: { item: { select: { id: true, name: true, sku: true } } },
  })

  const count = await db.stockCount.create({
    data: {
      countNumber,
      locationId,
      notes,
      countedById,
      items: {
        create: lots.map(lot => ({
          id: crypto.randomUUID(),
          itemId: lot.itemId,
          itemName: lot.item?.name ?? lot.itemName ?? 'Unknown item',
          systemQty: lot.quantity,
          countedQty: lot.quantity, // pre-fill with system qty
        })),
      },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: { include: { item: { select: { id: true, sku: true, name: true, baseUnit: true } } } },
    },
  })

  return NextResponse.json(count, { status: 201 })
}
