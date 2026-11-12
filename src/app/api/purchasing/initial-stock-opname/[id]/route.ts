import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { OPNAME_ITEM_SELECT } from '@/lib/purchasing/initialOpnameItem'
import { canUseInitialOpname } from '@/lib/purchasing/initialOpnameScope'

type Db = Awaited<ReturnType<typeof getDb>>

// Room & Loc lives on StockItemPlacement (per item per location — the same record Item by
// Location shows/edits), not on the opname row, so it's attached here for the detail view.
async function withPlacements<T extends { locationId: string; items: { itemId: string | null }[] }>(db: Db, count: T) {
  const itemIds = count.items.map(i => i.itemId).filter((v): v is string => !!v)
  const placements = itemIds.length
    ? await db.stockItemPlacement.findMany({ where: { locationId: count.locationId, itemId: { in: itemIds } }, select: { itemId: true, room: true, bin: true } })
    : []
  const map = new Map(placements.map(p => [p.itemId, { room: p.room, bin: p.bin }]))
  return { ...count, items: count.items.map(i => ({ ...i, placement: (i.itemId && map.get(i.itemId)) || null })) }
}

const cleanPlacement = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '') || null

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'FINANCE_DIRECTOR', 'WAREHOUSE']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  if (!(await canUseInitialOpname(db, role, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const count = await db.stockCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: OPNAME_ITEM_SELECT } },
        orderBy: { itemName: 'asc' },
      },
    },
  })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(await withPlacements(db, count))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  if (!(await canUseInitialOpname(db, role, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { items, notes, status } = await req.json()

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Once finalized, only the person who did the opname can correct it — not any
  // Admin/Finance Director who happens to have access to this menu.
  const isCorrection = count.status === 'COMPLETED'
  if (isCorrection && count.countedById !== session.user.id) {
    return NextResponse.json({ error: 'Only the person who did this opname can correct it' }, { status: 403 })
  }

  if (items?.length) {
    await Promise.all(
      items.map((item: { id: string; countedQty: number }) =>
        db.stockCountItem.update({ where: { id: item.id }, data: { countedQty: item.countedQty } })
      )
    )

    // Room & Loc typed in the opname table → the item's placement at this location (only rows
    // that sent a placement; clearing both fields removes it, same as Item by Location).
    const placementRows = (items as { id: string; room?: unknown; bin?: unknown }[]).filter(i => i.room !== undefined || i.bin !== undefined)
    if (placementRows.length) {
      const rows = await db.stockCountItem.findMany({ where: { countId: id, id: { in: placementRows.map(i => i.id) } }, select: { id: true, itemId: true } })
      const itemIdByRow = new Map(rows.map(r => [r.id, r.itemId]))
      for (const r of placementRows) {
        const itemId = itemIdByRow.get(r.id)
        if (!itemId) continue
        const room = cleanPlacement(r.room)
        const bin = cleanPlacement(r.bin)
        if (!room && !bin) {
          await db.stockItemPlacement.deleteMany({ where: { itemId, locationId: count.locationId } })
        } else {
          await db.stockItemPlacement.upsert({
            where: { itemId_locationId: { itemId, locationId: count.locationId } },
            create: { itemId, locationId: count.locationId, room, bin, updatedById: session.user.id },
            update: { room, bin, updatedById: session.user.id },
          })
        }
      }
    }
  }

  const updated = await db.stockCount.update({
    where: { id },
    data: {
      ...(notes !== undefined ? { notes } : {}),
      ...(status === 'COMPLETED' ? { status: 'COMPLETED', approvedById: session.user.id, approvedAt: new Date() } : {}),
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      countedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: OPNAME_ITEM_SELECT } },
        orderBy: { itemName: 'asc' },
      },
    },
  })

  if (status === 'COMPLETED') {
    const movementType = isCorrection ? 'INITIAL_CORRECTION' : 'INITIAL'
    for (const ci of updated.items) {
      if (!ci.itemId) continue

      const existingLot = await db.stockLot.findFirst({ where: { itemId: ci.itemId, locationId: updated.locationId } })
      const previousQty = existingLot?.quantity ?? 0
      const variance = ci.countedQty - previousQty
      if (variance === 0 && existingLot) continue

      if (existingLot) {
        await db.stockLot.update({ where: { id: existingLot.id }, data: { quantity: ci.countedQty } })
      } else if (ci.countedQty > 0) {
        await db.stockLot.create({ data: { id: crypto.randomUUID(), itemId: ci.itemId, locationId: updated.locationId, quantity: ci.countedQty, costPerUnit: ci.item?.standardCost ?? 0, updatedAt: new Date() } })
      }

      if (variance !== 0) {
        await db.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            itemId: ci.itemId,
            toLocationId: variance > 0 ? updated.locationId : null,
            fromLocationId: variance < 0 ? updated.locationId : null,
            quantity: Math.abs(variance),
            type: movementType,
            referenceId: updated.id,
            referenceType: 'STOCK_COUNT',
            notes: `Stock Opname Awal ${updated.countNumber}`,
            createdById: session.user.id,
          },
        })
      }
    }
  }

  return NextResponse.json(await withPlacements(db, updated))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  if (!(await canUseInitialOpname(db, role, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count || count.type !== 'INITIAL') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (count.status === 'COMPLETED') return NextResponse.json({ error: 'A completed opname cannot be deleted' }, { status: 400 })

  await db.stockCount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
