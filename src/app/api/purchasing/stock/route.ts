import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('locationId')

  const [lots, items, locations] = await Promise.all([
    db.stockLot.findMany({ where: { quantity: { gt: 0 }, ...(locationId ? { locationId } : {}) } }),
    db.purchaseItem.findMany({ select: { id: true, sku: true, name: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, minStock: true, valuationMethod: true } }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true, yachtId: true } }),
  ])

  const itemMap = new Map(items.map(i => [i.id, i]))
  const locMap  = new Map(locations.map(l => [l.id, l]))

  // Group by location → item, aggregating across multiple lots
  type AggRow = {
    item: (typeof items)[0]
    qty: number
    costPerUnit: number
    lotsCount: number
    nearestExpiry: Date | null
  }
  const byLocation = new Map<string, { location: (typeof locations)[0]; rows: Map<string, AggRow> }>()

  for (const lot of lots) {
    const item = itemMap.get(lot.itemId)
    const loc  = locMap.get(lot.locationId)
    if (!item || !loc) continue

    if (!byLocation.has(lot.locationId)) byLocation.set(lot.locationId, { location: loc, rows: new Map() })
    const locEntry = byLocation.get(lot.locationId)!

    if (!locEntry.rows.has(lot.itemId)) {
      locEntry.rows.set(lot.itemId, { item, qty: 0, costPerUnit: lot.costPerUnit, lotsCount: 0, nearestExpiry: null })
    }
    const row = locEntry.rows.get(lot.itemId)!
    row.qty += lot.quantity
    row.lotsCount += 1
    // Weighted average cost
    row.costPerUnit = row.qty > 0 ? (row.costPerUnit * (row.qty - lot.quantity) + lot.costPerUnit * lot.quantity) / row.qty : lot.costPerUnit
    // Nearest expiry
    if (lot.expiresAt) {
      if (!row.nearestExpiry || lot.expiresAt < row.nearestExpiry) row.nearestExpiry = lot.expiresAt
    }
  }

  const locationsOut = Array.from(byLocation.values())
    .map(({ location, rows }) => ({
      location,
      rows: Array.from(rows.values()),
    }))
    .sort((a, b) => a.location.name.localeCompare(b.location.name))

  const allRows = locationsOut.flatMap(l => l.rows)
  return NextResponse.json({
    locations: locationsOut,
    summary: {
      totalItems: allRows.length,
      lowStock: allRows.filter(r => r.item.minStock > 0 && r.qty < r.item.minStock).length,
    },
  })
}
