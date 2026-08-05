import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const counts = await db.stockCount.findMany({
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
  if (!locationId) return NextResponse.json({ error: 'locationId wajib diisi' }, { status: 400 })
  const countedById = bodyCountedById ?? session.user.id

  // Build count number
  const lastCount = await db.stockCount.findFirst({ orderBy: { createdAt: 'desc' }, select: { countNumber: true } })
  const lastNum = lastCount ? parseInt(lastCount.countNumber.replace('SC-', '')) : 0
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
