import type { getDb } from '@/lib/get-db'

type Db = Awaited<ReturnType<typeof getDb>>
type Tx = Pick<Db, 'stockTransfer' | 'purchaseRequestReservation'>

// Log one hand-out of warehouse stock to a PR line (PurchaseRequestReservation), linked to the TR
// it rides on and — for a backorder — the restock PO whose arrival freed the stock, so PR, Restock
// PO and TR can each point at the others.
export async function recordReservation(tx: Tx, r: {
  requestItemId: string
  locationId: string
  stockQty: number
  reservedQty: number
  source: 'WAREHOUSE_CHECK' | 'BACKORDER'
  transferNumber?: string | null
  purchaseOrderId?: string | null
  poNumber?: string | null
}) {
  const transfer = r.transferNumber
    ? await tx.stockTransfer.findUnique({ where: { transferNumber: r.transferNumber }, select: { id: true } })
    : null
  await tx.purchaseRequestReservation.create({
    data: { ...r, stockQty: Math.max(0, r.stockQty), transferId: transfer?.id ?? null },
  })
}
