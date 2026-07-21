import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

async function generateGrNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = `GR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.goodsReceipt.findFirst({ where: { grNumber: { startsWith: prefix } }, orderBy: { grNumber: 'desc' }, select: { grNumber: true } })
  const seq = last ? (parseInt(last.grNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const receipts = await db.goodsReceipt.findMany({
    orderBy: { receivedAt: 'desc' },
    include: { items: { select: { id: true } } },
  })
  const [locations, orders] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, name: true } }),
    db.purchaseOrder.findMany({ where: { id: { in: receipts.map(r => r.orderId) } }, select: { id: true, poNumber: true } }),
  ])
  const locMap = new Map(locations.map(l => [l.id, l]))
  const orderMap = new Map(orders.map(o => [o.id, o]))
  return NextResponse.json(receipts.map(r => ({
    ...r, itemCount: r.items.length, items: undefined,
    location: locMap.get(r.locationId) ?? null,
    order: orderMap.get(r.orderId) ?? null,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { orderId, locationId, notes, receivePhotoKey, receiverName, items } = body
  if (!orderId || !locationId) return NextResponse.json({ error: 'orderId dan locationId wajib diisi' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })

  // Permission + status check
  const poForPermission = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: { status: true, deliveryLocation: { select: { managedBy: true } } },
  })
  if (!poForPermission) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(poForPermission.status))
    return NextResponse.json({ error: 'Barang hanya dapat diterima setelah PO berstatus In Transit' }, { status: 400 })
  const managedBy = poForPermission.deliveryLocation?.managedBy ?? 'WAREHOUSE'
  const receiveAllowed = managedBy === 'PURCHASING'
    ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
    : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
  if (!receiveAllowed.includes(role))
    return NextResponse.json({ error: `Only ${managedBy.toLowerCase()} team can receive items for this PO` }, { status: 403 })

  const grNumber = await generateGrNumber(db)

  // Pre-fetch conversionFactor + standardCost for all items
  const itemIds = items.map((it: { itemId?: string }) => it.itemId).filter(Boolean) as string[]
  const [purchaseItemsData, poData] = await Promise.all([
    db.purchaseItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, conversionFactor: true, standardCost: true, baseUnit: true, name: true },
    }),
    db.purchaseOrder.findUnique({
      where: { id: orderId },
      select: { poNumber: true, supplierName: true, deliveryLocationId: true, deliveryLocation: { select: { name: true } } },
    }),
  ])
  const conversionMap = new Map(purchaseItemsData.map(i => [i.id, i.conversionFactor]))
  const itemDataMap = new Map(purchaseItemsData.map(i => [i.id, i]))

  const receipt = await db.$transaction(async (tx) => {
    const gr = await tx.goodsReceipt.create({
      data: {
        id: crypto.randomUUID(),
        grNumber,
        orderId,
        receivedById: session.user.id,
        receiverName: receiverName?.trim() || null,
        locationId,
        notes: notes?.trim() || null,
        receivePhotoKey: receivePhotoKey || null,
        receivedAt: new Date(),
        items: {
          create: items.map((it: { itemId?: string; poItemId?: string; itemName: string; receivedQty: number; unitCost?: number; outcome?: string; batch?: string; expiryDate?: string; notes?: string }) => ({
            id: crypto.randomUUID(),
            itemId: it.itemId || null,
            itemName: it.itemName,
            receivedQty: Number(it.receivedQty),
            unitCost: Number(it.unitCost) || 0,
            outcome: it.outcome || 'ACCEPTED',
            condition: it.outcome || 'good',
            batch: it.batch?.trim() || null,
            expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
            notes: it.notes?.trim() || null,
          })),
        },
      },
      include: { items: true },
    })

    for (const it of items) {
      if (!it.receivedQty) continue
      const purchaseQty = Number(it.receivedQty)
      if (purchaseQty <= 0) continue

      // Advance the PO line's receivedQty regardless of whether it's linked to a master item —
      // custom/non-stock lines (e.g. one-off purchases) still need to reach RECEIVED status.
      const poItem = it.poItemId
        ? await tx.purchaseOrderItem.findUnique({ where: { id: it.poItemId } })
        : await tx.purchaseOrderItem.findFirst({ where: { orderId, itemId: it.itemId || null, itemName: it.itemName } })
      if (poItem) {
        await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: { increment: purchaseQty } } })
      }

      // Stock lot / movement: applies to catalog items and to custom/non-catalog
      // PO lines alike (e.g. one-off purchases like "Grab" or event flowers) —
      // custom lines are keyed by (itemName, locationId) instead of itemId.
      const factor = it.itemId ? (conversionMap.get(it.itemId) ?? 1) : 1
      const baseQty = purchaseQty * factor                                // e.g. 1 carton × 24 = 24 cans
      const purchaseUnitCost = Number(it.unitCost) || 0                   // actual invoice price
      const baseCostPerUnit = factor > 1 && purchaseUnitCost > 0         // e.g. 48000 / 24 = 2000/can
        ? purchaseUnitCost / factor
        : purchaseUnitCost

      const lot = it.itemId
        ? await tx.stockLot.findFirst({ where: { itemId: it.itemId, locationId } })
        : await tx.stockLot.findFirst({ where: { itemId: null, itemName: it.itemName, locationId } })
      if (lot) {
        await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: baseQty }, updatedAt: new Date() } })
      } else {
        await tx.stockLot.create({
          data: {
            id: crypto.randomUUID(), locationId, quantity: baseQty, costPerUnit: baseCostPerUnit, updatedAt: new Date(),
            ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName, unit: it.unit?.trim() || null }),
          },
        })
      }
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(), toLocationId: locationId, quantity: baseQty, type: 'RECEIPT', referenceId: gr.id, referenceType: 'GoodsReceipt', createdById: session.user.id,
          ...(it.itemId ? { itemId: it.itemId } : { itemName: it.itemName }),
        },
      })

      // Everything below (discrepancy checks, standard cost) only applies to
      // items linked to the master catalog.
      if (!it.itemId) continue

      if (poItem) {
        // Auto-create Receiving Discrepancy exception if qty received ≠ qty remaining
        const remaining = poItem.orderedQty - poItem.receivedQty
        const discrepancy = purchaseQty - remaining
        if (Math.abs(discrepancy) > 0.0001) {
          const itemInfo = itemDataMap.get(it.itemId)
          const unitCostForValue = Number(it.unitCost) || itemInfo?.standardCost || 0
          await tx.inventoryException.create({
            data: {
              id: crypto.randomUUID(),
              type: 'RECEIVING_DISCREPANCY',
              itemId: it.itemId,
              itemName: it.itemName,
              locationId,
              locationName: poData?.deliveryLocation?.name ?? locationId,
              qty: Math.abs(discrepancy),
              value: Math.abs(discrepancy) * unitCostForValue,
              reason: `${discrepancy < 0 ? 'Short' : 'Over'} delivery on ${poData?.poNumber ?? orderId} from ${poData?.supplierName ?? 'supplier'}. Expected ${remaining} ${itemInfo?.baseUnit ?? ''}, received ${purchaseQty} ${itemInfo?.baseUnit ?? ''}.`,
              referenceId: gr.id,
              referenceType: 'GoodsReceipt',
              status: 'OPEN',
              updatedAt: new Date(),
            },
          })
        }
      }

      // Auto-create exception if outcome ≠ ACCEPTED
      const outcome = it.outcome || 'ACCEPTED'
      if (['DAMAGED', 'WRONG_ITEM', 'REJECTED'].includes(outcome)) {
        const itemInfo = itemDataMap.get(it.itemId)
        const outcomeLabel: Record<string, string> = {
          DAMAGED: 'Damaged goods received',
          WRONG_ITEM: 'Wrong item received',
          REJECTED: 'Goods rejected on receipt',
        }
        await tx.inventoryException.create({
          data: {
            id: crypto.randomUUID(),
            type: 'RECEIVING_DISCREPANCY',
            itemId: it.itemId,
            itemName: it.itemName,
            locationId,
            locationName: poData?.deliveryLocation?.name ?? locationId,
            qty: purchaseQty,
            value: purchaseQty * (Number(it.unitCost) || itemDataMap.get(it.itemId)?.standardCost || 0),
            reason: `${outcomeLabel[outcome]}: ${purchaseQty} ${itemDataMap.get(it.itemId)?.baseUnit ?? ''} on ${poData?.poNumber ?? orderId} from ${poData?.supplierName ?? 'supplier'}`,
            referenceId: gr.id,
            referenceType: 'GoodsReceipt',
            status: 'OPEN',
            updatedAt: new Date(),
          },
        })
      }

      // Auto-update standard cost per BASE unit
      if (baseCostPerUnit > 0) {
        await tx.purchaseItem.update({ where: { id: it.itemId }, data: { standardCost: baseCostPerUnit } })
      }
    }

    // Update PO status
    const poItems = await tx.purchaseOrderItem.findMany({ where: { orderId } })
    const allReceived = poItems.every(pi => pi.receivedQty >= pi.orderedQty)
    const anyReceived = poItems.some(pi => pi.receivedQty > 0)
    const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : undefined
    if (newStatus) await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: newStatus, updatedAt: new Date() } })

    return { gr, newStatus }
  })

  const { gr, newStatus } = receipt
  const po = await (await getDb(session)).purchaseOrder.findUnique({ where: { id: orderId }, select: { poNumber: true, supplierName: true } })
  if (po && newStatus) {
    const label = newStatus === 'RECEIVED' ? 'Barang Diterima' : 'Barang Diterima Sebagian'
    const msg = newStatus === 'RECEIVED'
      ? `${po.poNumber} dari ${po.supplierName ?? 'supplier'} telah diterima lengkap di gudang`
      : `${po.poNumber} dari ${po.supplierName ?? 'supplier'} diterima sebagian — cek detail penerimaan`
    notifyByRole(await getDb(session), ['PURCHASING', 'ADMIN'], newStatus === 'RECEIVED' ? 'PO_RECEIVED' : 'PO_PARTIALLY_RECEIVED',
      label, msg, orderId,
    ).catch(console.error)
  }

  return NextResponse.json(gr, { status: 201 })
}
