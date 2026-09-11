import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

// Turns a legacy Non-Stock Item into a real Stock Item (isStockTracked: true) — the
// other migration path alongside "Convert to Inventory" (see /api/inventory/items),
// for legacy items that belong back in the ordinary Purchasing stock ledger rather
// than the room/category-based Inventory module. Optionally seeds an opening StockLot
// so existing quantity isn't lost in the switch.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { locationId, quantity, unitCost } = body as { locationId?: string; quantity?: number; unitCost?: number }

  const item = await db.purchaseItem.findUnique({
    where: { id },
    select: { id: true, isStockTracked: true, migratedInventoryItem: { select: { id: true } } },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.isStockTracked) return NextResponse.json({ error: 'This item is already a Stock Item' }, { status: 409 })
  if (item.migratedInventoryItem) return NextResponse.json({ error: 'This item has already been converted to Inventory' }, { status: 409 })

  const qty = Number(quantity) || 0
  if (qty > 0 && !locationId) return NextResponse.json({ error: 'Location is required to record an opening quantity' }, { status: 400 })

  const updated = await db.$transaction(async tx => {
    const purchaseItem = await tx.purchaseItem.update({
      where: { id },
      data: { isStockTracked: true, currentLocationId: null, updatedAt: new Date() },
    })

    if (qty > 0 && locationId) {
      await tx.stockLot.create({
        data: { id: crypto.randomUUID(), itemId: id, locationId, quantity: qty, costPerUnit: Number(unitCost) || 0, updatedAt: new Date() },
      })
      await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(), itemId: id, toLocationId: locationId, quantity: qty,
          type: 'ADJUSTMENT', referenceType: 'ConvertToStock',
          notes: 'Opening quantity recorded when converting from Non-Stock Item to Stock Item',
          createdById: session.user.id,
        },
      })
    }

    return purchaseItem
  })

  return NextResponse.json(updated)
}
