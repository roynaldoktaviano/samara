import type { getDb } from '@/lib/get-db'
import { createOrAppendTransfer } from '@/lib/purchasing/transferActions'
import { notifyByRoleForRequest, notifyRequester } from '@/lib/notify-purchasing'

type Db = Awaited<ReturnType<typeof getDb>>

/**
 * Stock just landed at `locationId` (a PO receipt or an incoming transfer): hand it to PR lines
 * backordered there (PurchaseRequestItem.backorderQty — the part the warehouse couldn't ship
 * when it accepted the line), oldest PR first. Each allocation becomes a PENDING transfer to the
 * PR's delivery location — the follow-up "draft DN" — appended to the PR's still-pending TR
 * from this warehouse if there is one. Only FREE stock is handed out (on hand minus every
 * PENDING transfer already reserving it), so restock bought for Min. Stock isn't double-promised.
 * Best-effort: never throws, so a receipt never fails because of it.
 */
export async function allocateBackorders(db: Db, locationId: string, itemIds: (string | null)[]): Promise<string[]> {
  try {
    const ids = [...new Set(itemIds.filter(Boolean) as string[])]
    if (!ids.length) return []
    const waiting = await db.purchaseRequestItem.findMany({
      where: {
        backorderLocationId: locationId, backorderQty: { gt: 0 }, itemId: { in: ids },
        request: { status: { notIn: ['CANCELLED', 'REJECTED'] }, deliveryLocationId: { not: null } },
      },
      select: {
        id: true, itemId: true, itemName: true, backorderQty: true,
        request: { select: { id: true, prNumber: true, deliveryLocationId: true, createdAt: true } },
      },
    })
    if (!waiting.length) return []
    waiting.sort((a, b) => a.request.createdAt.getTime() - b.request.createdAt.getTime())

    const created = new Map<string, { prNumber: string; transferNumber: string; lines: string[] }>() // key: PR id
    for (const itemId of new Set(waiting.map(w => w.itemId!))) {
      for (const line of waiting.filter(w => w.itemId === itemId)) {
        const done = await db.$transaction(async tx => {
          const [lots, reserved] = await Promise.all([
            tx.stockLot.aggregate({ where: { itemId, locationId }, _sum: { quantity: true } }),
            tx.stockTransferItem.aggregate({ where: { itemId, transfer: { status: 'PENDING', fromLocationId: locationId } }, _sum: { requestedQty: true } }),
          ])
          const free = (lots._sum.quantity ?? 0) - (reserved._sum.requestedQty ?? 0)
          const qty = Math.min(free, line.backorderQty)
          if (qty <= 0) return null
          // Guard against a concurrent receipt already serving this line.
          const claimed = await tx.purchaseRequestItem.updateMany({
            where: { id: line.id, backorderQty: { gte: qty } },
            data: { backorderQty: { decrement: qty } },
          })
          if (!claimed.count) return null
          if (line.backorderQty - qty <= 1e-9) {
            await tx.purchaseRequestItem.update({ where: { id: line.id }, data: { backorderQty: 0, backorderLocationId: null } })
          }
          const transferNumber = await createOrAppendTransfer(tx, {
            requestId: line.request.id,
            prNumber: line.request.prNumber,
            deliveryLocationId: line.request.deliveryLocationId!,
            fromLocationId: locationId,
            items: [{ itemId, itemName: line.itemName, baseQty: qty }],
          })
          return { qty, transferNumber }
        })
        if (!done) continue
        const entry = created.get(line.request.id) ?? { prNumber: line.request.prNumber, transferNumber: done.transferNumber, lines: [] }
        entry.lines.push(`${line.itemName} ${Math.round(done.qty * 100) / 100}`)
        created.set(line.request.id, entry)
      }
    }

    for (const [requestId, c] of created) {
      const body = `${c.transferNumber} siap dikirim untuk backorder ${c.prNumber}: ${c.lines.join(', ')}.`
      await notifyByRoleForRequest(db, ['WAREHOUSE', 'ADMIN'], 'PR_BACKORDER_READY', 'Backorder siap dikirim', body, requestId)
      await notifyRequester(db, requestId, { type: 'PR_BACKORDER_READY', title: 'Sisa barang siap dikirim', body })
    }
    return [...created.values()].map(c => c.transferNumber)
  } catch (e) {
    console.error('allocateBackorders failed', e)
    return []
  }
}
