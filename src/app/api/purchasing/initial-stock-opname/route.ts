import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

// Temporary onboarding-only feature — see memory project-initial-stock-opname-temporary.
// Restricted to Admin/Finance Director since it finalizes without an approval step.
const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const opnames = await db.stockCount.findMany({
    where: { type: 'INITIAL' },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Locations that already have a finalized initial opname can't start another one —
  // the frontend uses this to filter the "new opname" location picker.
  const completed = await db.stockCount.findMany({
    where: { type: 'INITIAL', status: 'COMPLETED' },
    select: { locationId: true },
  })

  return NextResponse.json({ opnames, completedLocationIds: completed.map(c => c.locationId) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { locationId } = await req.json()
  if (!locationId) return NextResponse.json({ error: 'locationId wajib diisi' }, { status: 400 })

  const existing = await db.stockCount.findFirst({ where: { type: 'INITIAL', locationId, status: { not: 'APPROVED' } } })
  if (existing?.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Lokasi ini sudah punya Stock Opname Awal yang selesai' }, { status: 409 })
  }
  if (existing) {
    // A draft already exists for this location — resume it instead of creating a duplicate.
    return NextResponse.json(existing, { status: 200 })
  }

  const lastCount = await db.stockCount.findFirst({
    where: { countNumber: { startsWith: 'ISO-' } },
    orderBy: { createdAt: 'desc' },
    select: { countNumber: true },
  })
  const lastNum = lastCount ? parseInt(lastCount.countNumber.replace('ISO-', '')) : 0
  const countNumber = `ISO-${String(lastNum + 1).padStart(4, '0')}`

  // Pre-fill with whatever the location already has, same as a normal count — the
  // difference is items can still be freely added/removed afterwards while in DRAFT.
  const lots = await db.stockLot.findMany({
    where: { locationId, quantity: { gt: 0 } },
    include: { item: { select: { id: true, name: true } } },
  })

  const count = await db.stockCount.create({
    data: {
      countNumber,
      locationId,
      type: 'INITIAL',
      countedById: session.user.id,
      items: {
        create: lots.map(lot => ({
          id: crypto.randomUUID(),
          itemId: lot.itemId,
          itemName: lot.item?.name ?? lot.itemName ?? 'Unknown item',
          systemQty: lot.quantity,
          countedQty: lot.quantity,
        })),
      },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: { include: { item: { select: { id: true, sku: true, name: true, baseUnit: true, category: true } } } },
    },
  })

  return NextResponse.json(count, { status: 201 })
}
