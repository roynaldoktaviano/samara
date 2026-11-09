import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { PURCHASING_ROLES } from '@/lib/notify-purchasing'
import { notifyPrRouted } from '@/lib/purchasing/requestItems'
import { generatePrNumber } from '@/lib/purchasing/docNumber'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

/**
 * Item by Location → "Create Purchase Request": restock a warehouse straight from its stock
 * table. Unlike the normal PR form this skips manager approval and Warehouse's stock check —
 * it IS the warehouse asking to be refilled — so the PR goes ON_PROCESS at once and every line
 * lands in Purchasing's queue. Its lines then show as "Pending" on the stock table until
 * Purchasing converts them to a PO (see GET /api/purchasing/stock).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { locationId, items, notes } = (await req.json()) as {
    locationId?: string
    items?: { itemId: string; quantity: number; unit: string }[]
    notes?: string
  }
  if (!locationId) return NextResponse.json({ error: 'Missing warehouse' }, { status: 400 })
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Select at least one item' }, { status: 400 })

  const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true, name: true, type: true } })
  if (!loc || loc.type !== 'WAREHOUSE') return NextResponse.json({ error: 'Restock requests can only be made for a warehouse' }, { status: 400 })

  const ids = [...new Set(items.map(i => i.itemId))]
  if (ids.length !== items.length) return NextResponse.json({ error: 'An item is listed twice' }, { status: 400 })
  const masters = await db.purchaseItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true },
  })
  const masterMap = new Map(masters.map(m => [m.id, m]))
  for (const it of items) {
    const m = masterMap.get(it.itemId)
    if (!m) return NextResponse.json({ error: 'One or more items were not found' }, { status: 400 })
    if (!(Number(it.quantity) > 0)) return NextResponse.json({ error: `Quantity for "${m.name}" must be greater than 0` }, { status: 400 })
    if (it.unit !== m.baseUnit && it.unit !== m.purchaseUnit) return NextResponse.json({ error: `Invalid unit for "${m.name}"` }, { status: 400 })
  }

  const prNumber = await generatePrNumber(db)
  const now = new Date()
  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById: session.user.id,
      deliveryLocationId: loc.id,
      purpose: 'STOCK_INVENTORY',
      status: 'ON_PROCESS',
      notes: notes?.trim() || `Restock ${loc.name} — created from Item by Location`,
      updatedAt: now,
      items: {
        create: items.map(it => {
          const m = masterMap.get(it.itemId)!
          // standardCost is per base unit; estimatedCost is per line unit.
          const perUnit = it.unit === m.purchaseUnit && m.purchaseUnit !== m.baseUnit ? (m.conversionFactor || 1) : 1
          return {
            id: crypto.randomUUID(),
            itemId: m.id,
            itemName: m.name,
            quantity: Number(it.quantity),
            unit: it.unit,
            estimatedCost: (m.standardCost || 0) * perUnit,
            viaWarehouse: false,
            requestType: 'NEW' as const,
          }
        }),
      },
    },
    select: { id: true, prNumber: true, division: true },
  })

  await notifyPrRouted(db, { id: request.id, prNumber, division: request.division ?? null }, items.map(() => false), {
    type: 'REQUEST_ORDER_SUBMITTED',
    skipPurchasing: roleMatches(role, PURCHASING_ROLES),
  })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ id: request.id, prNumber }, { status: 201 })
}
