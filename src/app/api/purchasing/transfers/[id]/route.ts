import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const transfer = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      items: { include: { item: { select: { baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true } } } },
      dispatchedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
      expectedReceivedBy: { select: { id: true, name: true } },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [fromLoc, toLoc] = await Promise.all([
    db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: { id: true, name: true, type: true } }),
    db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { id: true, name: true, type: true } }),
  ])
  const stockLots = await db.stockLot.findMany({
    where: { locationId: transfer.fromLocationId, itemId: { in: transfer.items.map(i => i.itemId).filter(Boolean) as string[] } },
  })
  const stockMap = new Map(stockLots.map(l => [l.itemId, l.quantity]))
  const items = transfer.items.map(i => {
    const unitCost = i.item?.standardCost ?? 0
    return {
      ...i,
      baseUnit: i.item?.baseUnit ?? null,
      purchaseUnit: i.item?.purchaseUnit ?? null,
      conversionFactor: i.item?.conversionFactor ?? 1,
      availableQty: i.itemId ? (stockMap.get(i.itemId) ?? 0) : null,
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
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const dispatchItems = items as { itemId: string; itemName: string; dispatchedQty: number }[]

    const [fromLoc] = await Promise.all([
      db.stockLocation.findUnique({ where: { id: transfer.fromLocationId }, select: { name: true } }),
    ])

    await db.$transaction(async (tx) => {
      for (const it of dispatchItems) {
        if (!it.itemId || !it.dispatchedQty) continue
        const qty = Number(it.dispatchedQty)
        if (qty <= 0) continue
        const lot = await tx.stockLot.findFirst({ where: { itemId: it.itemId, locationId: transfer.fromLocationId } })
        const currentQty = lot?.quantity ?? 0

        // Auto-create Negative Stock exception if insufficient
        if (currentQty < qty) {
          await tx.inventoryException.create({
            data: {
              id: crypto.randomUUID(),
              type: 'NEGATIVE_STOCK',
              itemId: it.itemId,
              itemName: it.itemName,
              locationId: transfer.fromLocationId,
              locationName: fromLoc?.name ?? '—',
              qty: qty - currentQty,
              reason: `Stock kurang saat dispatch transfer ${transfer.transferNumber}`,
              referenceId: id,
              referenceType: 'StockTransfer',
              status: 'OPEN',
              updatedAt: new Date(),
            },
          })
        }

        if (lot) {
          await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: qty }, updatedAt: new Date() } })
        } else {
          await tx.stockLot.create({ data: { id: crypto.randomUUID(), itemId: it.itemId, locationId: transfer.fromLocationId, quantity: -qty, costPerUnit: 0, updatedAt: new Date() } })
        }
        await tx.stockMovement.create({
          data: { id: crypto.randomUUID(), itemId: it.itemId, fromLocationId: transfer.fromLocationId, quantity: qty, type: 'TRANSFER_OUT', referenceId: id, referenceType: 'StockTransfer', createdById: session.user.id },
        })
        await tx.stockTransferItem.updateMany({ where: { transferId: id, itemId: it.itemId }, data: { dispatchedQty: qty } })
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
    if (transfer.status !== 'DISPATCHED') return NextResponse.json({ error: 'Transfer belum dikirim' }, { status: 409 })
    if (!receivePhotoKey) return NextResponse.json({ error: 'Foto penerimaan wajib diupload' }, { status: 400 })
    const receiveItems = items as { itemId: string; itemName: string; receivedQty: number }[]

    const toLoc = await db.stockLocation.findUnique({ where: { id: transfer.toLocationId }, select: { name: true } })

    await db.$transaction(async (tx) => {
      for (const it of receiveItems) {
        if (!it.itemId || !it.receivedQty) continue
        const qty = Number(it.receivedQty)
        if (qty <= 0) continue

        // Find dispatched qty for discrepancy check
        const transferItem = transfer.items.find(ti => ti.itemId === it.itemId)
        const dispatchedQty = transferItem?.dispatchedQty ?? 0

        const lot = await tx.stockLot.findFirst({ where: { itemId: it.itemId, locationId: transfer.toLocationId } })
        if (lot) {
          await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: qty }, updatedAt: new Date() } })
        } else {
          await tx.stockLot.create({ data: { id: crypto.randomUUID(), itemId: it.itemId, locationId: transfer.toLocationId, quantity: qty, costPerUnit: 0, updatedAt: new Date() } })
        }
        await tx.stockMovement.create({
          data: { id: crypto.randomUUID(), itemId: it.itemId, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, quantity: qty, type: 'TRANSFER_IN', referenceId: id, referenceType: 'StockTransfer', createdById: session.user.id },
        })
        await tx.stockTransferItem.updateMany({ where: { transferId: id, itemId: it.itemId }, data: { receivedQty: qty } })

        // Auto-create Transfer Discrepancy exception if qty doesn't match
        if (dispatchedQty > 0 && qty !== dispatchedQty) {
          await tx.inventoryException.create({
            data: {
              id: crypto.randomUUID(),
              type: 'TRANSFER_DISCREPANCY',
              itemId: it.itemId,
              itemName: it.itemName,
              locationId: transfer.toLocationId,
              locationName: toLoc?.name ?? '—',
              qty: Math.abs(qty - dispatchedQty),
              reason: `Dikirim ${dispatchedQty}, diterima ${qty}`,
              referenceId: id,
              referenceType: 'StockTransfer',
              status: 'OPEN',
              updatedAt: new Date(),
            },
          })
        }
      }
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedByName: receivedByName ?? null,
          receivePhotoKey,
          receivedAt: new Date(),
          updatedAt: new Date(),
        },
      })
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })
}
