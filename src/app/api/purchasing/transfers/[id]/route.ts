import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { receiveTransferLeg } from '@/lib/purchasing/transferActions'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const transfer = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      items: { include: { item: { select: { baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } } } },
      dispatchedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
      expectedReceivedBy: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [fromLoc, toLoc] = await Promise.all([
    db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: { id: true, name: true, type: true } }),
    db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { id: true, name: true, type: true } }),
  ])
  // All lots currently at the source location — catalog items keyed by itemId,
  // non-catalog ("non-stock") items keyed by itemName (they can have several
  // lots, one per receiving PO, so their availableQty is the sum across them).
  const stockLots = await db.stockLot.findMany({ where: { locationId: transfer.fromLocationId } })
  const stockMap = new Map<string, number>()
  for (const lot of stockLots) {
    const key = lot.itemId ?? `name:${lot.itemName}`
    stockMap.set(key, (stockMap.get(key) ?? 0) + lot.quantity)
  }
  const items = transfer.items.map(i => {
    const unitCost = i.item?.standardCost ?? 0
    return {
      ...i,
      baseUnit: i.item?.baseUnit ?? null,
      purchaseUnit: i.item?.purchaseUnit ?? null,
      conversionFactor: i.item?.conversionFactor ?? 1,
      availableQty: stockMap.get(i.itemId ?? `name:${i.itemName}`) ?? 0,
      unitCost,
      requestedValue: i.requestedQty * unitCost,
      dispatchedValue: i.dispatchedQty * unitCost,
      receivedValue: i.receivedQty * unitCost,
    }
  })
  const totalValue = items.reduce((sum, i) => sum + (transfer.status === 'PENDING' ? i.requestedValue : transfer.status === 'DISPATCHED' ? i.dispatchedValue : i.receivedValue), 0)
  return NextResponse.json({
    ...transfer,
    fromLocation: fromLoc,
    toLocation: toLoc,
    totalValue,
    items,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { action, items, dispatchPhotoKey, receivePhotoKey, expectedReceiverName, receivedByName } = body

  const transfer = await db.stockTransfer.findUnique({ where: { id }, include: { items: true } })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'cancel') {
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Hanya transfer PENDING yang bisa dibatalkan' }, { status: 409 })
    await db.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'dispatch') {
    if (transfer.status !== 'PENDING') return NextResponse.json({ error: 'Transfer sudah diproses' }, { status: 409 })
    if (!dispatchPhotoKey) return NextResponse.json({ error: 'Foto dispatch wajib diupload' }, { status: 400 })
    const dispatchItems = items as { itemId: string | null; itemName: string; dispatchedQty: number }[]

    // Stock is re-checked here (not trusted from the client) — it can have moved since
    // the transfer was requested (another transfer, a sale, a stock count). Dispatching
    // more than what's physically on the shelf is rejected outright rather than allowed
    // to go negative with just a logged exception.
    const toCheck = dispatchItems.filter(it => Number(it.dispatchedQty) > 0)
    const lots = await db.stockLot.findMany({ where: { locationId: transfer.fromLocationId } })
    const stockMap = new Map<string, number>()
    for (const lot of lots) {
      const key = lot.itemId ?? `name:${lot.itemName}`
      stockMap.set(key, (stockMap.get(key) ?? 0) + lot.quantity)
    }
    const insufficient = toCheck
      .map(it => ({ ...it, available: stockMap.get(it.itemId ?? `name:${it.itemName}`) ?? 0 }))
      .filter(it => Number(it.dispatchedQty) > it.available)
    if (insufficient.length > 0) {
      const detail = insufficient.map(it => `${it.itemName} (tersedia: ${it.available}, diminta: ${it.dispatchedQty})`).join(', ')
      return NextResponse.json({ error: `Stok tidak cukup untuk: ${detail}` }, { status: 409 })
    }

    await db.$transaction(async (tx) => {
      for (const it of dispatchItems) {
        if (!it.dispatchedQty) continue
        const qty = Number(it.dispatchedQty)
        if (qty <= 0) continue
        const lotWhere = it.itemId
          ? { itemId: it.itemId, locationId: transfer.fromLocationId }
          : { itemId: null, itemName: it.itemName, locationId: transfer.fromLocationId }
        const lot = await tx.stockLot.findFirst({ where: lotWhere })

        if (lot) {
          await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: qty }, updatedAt: new Date() } })
        } else {
          await tx.stockLot.create({
            data: {
              id: crypto.randomUUID(), locationId: transfer.fromLocationId, quantity: -qty, costPerUnit: 0, updatedAt: new Date(),
              ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
            },
          })
        }
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(), fromLocationId: transfer.fromLocationId, quantity: qty, type: 'TRANSFER_OUT', referenceId: id, referenceType: 'StockTransfer', createdById: session.user.id,
            ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
          },
        })
        await tx.stockTransferItem.updateMany({ where: { transferId: id, itemId: it.itemId || null, itemName: it.itemName }, data: { dispatchedQty: qty } })
      }
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'DISPATCHED',
          dispatchedById: session.user.id,
          expectedReceiverName: expectedReceiverName ?? null,
          dispatchPhotoKey,
          dispatchedAt: new Date(),
          updatedAt: new Date(),
        },
      })
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'receive') {
    const receiveItems = items as { itemId: string | null; itemName: string; receivedQty: number }[]
    const result = await receiveTransferLeg(db, id, {
      items: receiveItems,
      receivePhotoKey,
      receivedByName: receivedByName ?? null,
      receivedById: session.user.id,
      movementCreatedById: session.user.id,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })
}
