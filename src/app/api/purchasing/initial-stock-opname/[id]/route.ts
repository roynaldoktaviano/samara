import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { OPNAME_ITEM_SELECT } from '@/lib/purchasing/initialOpnameItem'
import { canUseInitialOpname } from '@/lib/purchasing/initialOpnameScope'
import { normalizeTreatment } from '@/lib/purchasing/treatment'
import { nextVal } from '@/lib/counter'

type Db = Awaited<ReturnType<typeof getDb>>

// Room & Loc lives on StockItemPlacement (per item per location — the same record Item by
// Location shows/edits), not on the opname row, so it's attached here for the detail view.
async function withPlacements<T extends { locationId: string; items: { itemId: string | null }[] }>(db: Db, count: T) {
  const itemIds = count.items.map(i => i.itemId).filter((v): v is string => !!v)
  const placements = itemIds.length
    ? await db.stockItemPlacement.findMany({ where: { locationId: count.locationId, itemId: { in: itemIds } }, select: { itemId: true, room: true, bin: true } })
    : []
  const map = new Map(placements.map(p => [p.itemId, { room: p.room, bin: p.bin }]))
  // Ship Inventory rooms — suggested in the Room column so Asset rows land in an existing room.
  const inventoryRooms = await db.inventoryRoom.findMany({ where: { locationId: count.locationId, isActive: true }, orderBy: { name: 'asc' }, select: { name: true } })
  return {
    ...count,
    inventoryRooms: inventoryRooms.map(r => r.name),
    items: count.items.map(i => ({ ...i, placement: (i.itemId && map.get(i.itemId)) || null })),
  }
}

// One Initial Stock Opname covers both stock and ship Inventory: on a ship, products of
// Type = Asset become InventoryItem rows (Room = the row's Room, Category = its Sub-Category)
// instead of a stock lot — same rule as receiveGoods for ASSET arriving on a ship.
const isShipLocation = (loc: { type: string; yachtId: string | null }) => loc.type === 'VESSEL' || !!loc.yachtId
const DEFAULT_INVENTORY_NAME = 'General'

async function applyAssetToInventory(
  db: Db,
  opts: { locationId: string; countNumber: string; itemName: string; subCategory: string | null; room: string | null; qty: number; unitPrice: number; userId: string },
) {
  const marker = `From Initial Stock Opname ${opts.countNumber}`
  const roomName = (opts.room ?? '').trim().slice(0, 100) || DEFAULT_INVENTORY_NAME
  const categoryName = (opts.subCategory ?? '').trim().slice(0, 100) || DEFAULT_INVENTORY_NAME
  const qty = Math.max(0, Math.round(opts.qty))

  const existing = await db.inventoryItem.findFirst({
    where: { locationId: opts.locationId, notes: marker, name: { equals: opts.itemName, mode: 'insensitive' } },
    select: { id: true },
  })
  if (!existing && qty === 0) return

  const room = (await db.inventoryRoom.findFirst({ where: { locationId: opts.locationId, name: { equals: roomName, mode: 'insensitive' } } }))
    ?? await db.inventoryRoom.create({ data: { name: roomName, locationId: opts.locationId } })
  if (!room.isActive) await db.inventoryRoom.update({ where: { id: room.id }, data: { isActive: true } })
  const category = (await db.inventoryCategory.findFirst({ where: { roomId: room.id, name: { equals: categoryName, mode: 'insensitive' } } }))
    ?? await db.inventoryCategory.create({ data: { name: categoryName, roomId: room.id } })
  if (!category.isActive) await db.inventoryCategory.update({ where: { id: category.id }, data: { isActive: true } })

  if (existing) {
    // Correction of a completed opname: move/resize the row it created; 0 = decommission.
    await db.inventoryItem.update({
      where: { id: existing.id },
      data: { roomId: room.id, categoryId: category.id, ...(qty > 0 ? { quantity: qty, isActive: true } : { isActive: false }) },
    })
    return
  }
  await db.inventoryItem.create({
    data: {
      id: crypto.randomUUID(),
      itemNumber: 'INV-' + String(await nextVal('inventory-item', db)).padStart(4, '0'),
      name: opts.itemName,
      categoryId: category.id,
      roomId: room.id,
      locationId: opts.locationId,
      quantity: qty,
      unitPrice: opts.unitPrice,
      notes: marker,
      createdById: opts.userId,
    },
  })
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
      location: { select: { id: true, name: true, type: true, yachtId: true } },
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
      location: { select: { id: true, name: true, type: true, yachtId: true } },
      countedBy: { select: { id: true, name: true } },
      items: {
        include: { item: { select: OPNAME_ITEM_SELECT } },
        orderBy: { itemName: 'asc' },
      },
    },
  })

  if (status === 'COMPLETED') {
    const movementType = isCorrection ? 'INITIAL_CORRECTION' : 'INITIAL'
    const onShip = isShipLocation(updated.location)
    const assetItemIds = updated.items.filter(ci => ci.itemId && onShip && normalizeTreatment(ci.item?.treatment) === 'ASSET').map(ci => ci.itemId as string)
    const assetPlacements = assetItemIds.length
      ? new Map((await db.stockItemPlacement.findMany({ where: { locationId: updated.locationId, itemId: { in: assetItemIds } }, select: { itemId: true, room: true } })).map(p => [p.itemId, p.room]))
      : new Map<string, string | null>()

    for (const ci of updated.items) {
      if (!ci.itemId) continue

      // Asset on a ship → ship Inventory, never stock. Any stock lot it still has here is
      // emptied (logged as an initial movement) so it isn't counted twice.
      if (onShip && normalizeTreatment(ci.item?.treatment) === 'ASSET') {
        await applyAssetToInventory(db, {
          locationId: updated.locationId,
          countNumber: updated.countNumber,
          itemName: ci.item?.name ?? ci.itemName,
          subCategory: ci.item?.category ?? null,
          room: assetPlacements.get(ci.itemId) ?? null,
          qty: ci.countedQty,
          unitPrice: ci.item?.standardCost ?? 0,
          userId: session.user.id,
        })
        const lot = await db.stockLot.findFirst({ where: { itemId: ci.itemId, locationId: updated.locationId, quantity: { gt: 0 } } })
        if (lot) {
          await db.stockLot.update({ where: { id: lot.id }, data: { quantity: 0 } })
          await db.stockMovement.create({
            data: {
              id: crypto.randomUUID(), itemId: ci.itemId, fromLocationId: updated.locationId, toLocationId: null,
              quantity: lot.quantity, type: movementType, referenceId: updated.id, referenceType: 'STOCK_COUNT',
              notes: `Stock Opname Awal ${updated.countNumber} — Asset moved to ship Inventory`, createdById: session.user.id,
            },
          })
        }
        continue
      }

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
