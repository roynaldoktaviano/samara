import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '') || null

// Set an item's Room & Loc (shelf) at one location — see StockItemPlacement. Clearing both
// fields removes the row.
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  const itemId = typeof body.itemId === 'string' ? body.itemId : ''
  const locationId = typeof body.locationId === 'string' ? body.locationId : ''
  if (!itemId || !locationId) return NextResponse.json({ error: 'itemId and locationId are required' }, { status: 400 })
  const room = clean(body.room)
  const bin = clean(body.bin)

  const [item, location] = await Promise.all([
    db.purchaseItem.findUnique({ where: { id: itemId }, select: { id: true } }),
    db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true } }),
  ])
  if (!item || !location) return NextResponse.json({ error: 'Item or location not found' }, { status: 404 })

  if (!room && !bin) {
    await db.stockItemPlacement.deleteMany({ where: { itemId, locationId } })
    return NextResponse.json({ placement: null })
  }

  const placement = await db.stockItemPlacement.upsert({
    where: { itemId_locationId: { itemId, locationId } },
    create: { itemId, locationId, room, bin, updatedById: session.user.id },
    update: { room, bin, updatedById: session.user.id },
    select: { room: true, bin: true },
  })
  return NextResponse.json({ placement })
}
