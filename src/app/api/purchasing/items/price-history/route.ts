import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

// Recent price/supplier history for an item — lets Purchasing reuse a previous
// purchase instead of retyping. Matches by itemId when the item is a catalog item;
// falls back to a case-insensitive itemName match for custom (non-catalog) requests,
// since those have no itemId to key off of.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  const itemName = searchParams.get('itemName')
  if (!itemId && !itemName?.trim()) return NextResponse.json({ history: [] })

  const orderItems = await db.purchaseOrderItem.findMany({
    where: {
      unitCost: { gt: 0 },
      ...(itemId ? { itemId } : { itemName: { equals: itemName!.trim(), mode: 'insensitive' } }),
    },
    orderBy: { order: { orderedAt: 'desc' } },
    take: 20,
    select: {
      unitCost: true,
      order: { select: { poNumber: true, orderedAt: true, supplierId: true, supplierName: true } },
    },
  })

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

  return NextResponse.json({ history })
}
