import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

// Recent price/supplier history for an item — lets Purchasing reuse a previous
// purchase instead of retyping. Matches by itemId when the item is a catalog item;
// falls back to a case-insensitive itemName match for custom (non-catalog) requests,
// since those have no itemId to key off of.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const itemName = searchParams.get('itemName')
  // The PurchaseRequestItem currently being edited — excluded from the cross-PR
  // quotations lookup below so an item never "reuses" a quote gathered on itself.
  const excludeRequestItemId = searchParams.get('excludeRequestItemId')
  if (!itemId && !itemName?.trim()) return NextResponse.json({ history: [], quotations: [] })

  const itemMatch = itemId ? { itemId } : { itemName: { equals: itemName!.trim(), mode: 'insensitive' as const } }

  const [orderItems, quotationRows] = await Promise.all([
    db.purchaseOrderItem.findMany({
      where: { unitCost: { gt: 0 }, ...itemMatch },
      orderBy: { order: { orderedAt: 'desc' } },
      take: 20,
      select: {
        unitCost: true,
        order: { select: { poNumber: true, orderedAt: true, supplierId: true, supplierName: true } },
      },
    }),
    // Quotations gathered for this same item on OTHER purchase requests — lets Purchasing
    // reuse a quote already on file instead of asking the supplier to re-quote something
    // that was already priced recently for a different PR.
    db.purchaseQuotation.findMany({
      where: {
        requestItem: { ...itemMatch, ...(excludeRequestItemId ? { id: { not: excludeRequestItemId } } : {}) },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: {
        supplierId: true, supplierName: true, price: true, fileKey: true, submittedAt: true,
        requestItem: { select: { request: { select: { prNumber: true } } } },
      },
    }),
  ])

  // Dedupe by supplier — keep only the most recent purchase per supplier, capped at 3.
  const seenSuppliers = new Set<string>()
  const history: { supplierId: string | null; supplierName: string | null; price: number; poNumber: string; orderedAt: string }[] = []
  for (const oi of orderItems) {
    const key = oi.order.supplierId ?? oi.order.supplierName ?? '__none__'
    if (seenSuppliers.has(key)) continue
    seenSuppliers.add(key)
    history.push({
      supplierId: oi.order.supplierId,
      supplierName: oi.order.supplierName,
      price: oi.unitCost,
      poNumber: oi.order.poNumber,
      orderedAt: oi.order.orderedAt.toISOString(),
    })
    if (history.length >= 3) break
  }

  // Same dedupe rule for quotations — most recent quote per supplier, capped at 3.
  const seenQuoteSuppliers = new Set<string>()
  const quotations: { supplierId: string | null; supplierName: string; price: number; fileKey: string | null; submittedAt: string; prNumber: string }[] = []
  for (const q of quotationRows) {
    const key = q.supplierId ?? q.supplierName
    if (seenQuoteSuppliers.has(key)) continue
    seenQuoteSuppliers.add(key)
    quotations.push({
      supplierId: q.supplierId,
      supplierName: q.supplierName,
      price: q.price,
      fileKey: q.fileKey,
      submittedAt: q.submittedAt.toISOString(),
      prNumber: q.requestItem.request.prNumber,
    })
    if (quotations.length >= 3) break
  }

  return NextResponse.json({ history, quotations })
}
