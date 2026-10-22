import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { roleMatches } from '@/lib/role-utils'
import { buildTripResolver } from '@/lib/purchasing/tripUsage'

// Trip Usage report: per yacht & year, every trip (Open Trip / Private Charter, by endDate year
// like the trip numbering) with the goods charged to it as usage (pemakaian) — what was taken,
// how much, at what cost, and which document brought it in (Transfer / PO receipt / stock count
// / POS). Reads the same StockMovement usage ledger and trip-matching rule as Finance › Trip
// Stats, so the totals agree. Reversals (returned from the ship) carry a negative qty & cost.
// POS bar sales are folded into one line per item per day — a line per sale would bury the rest.

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'PURCHASING', 'WAREHOUSE', 'FINANCE']

type UsageKey = 'SHIP_USAGE' | 'BAR_COGS' | 'COMPLIMENTARY' | 'SHRINKAGE' | 'MAINTENANCE'
// Charged to trips. MAINTENANCE (spare parts) is ship upkeep — listed per ship instead.
const TRIP_USAGE_TYPES = ['SHIP_USAGE', 'BAR_COGS', 'COMPLIMENTARY', 'SHRINKAGE'] as const

export interface TripUsageLine {
  date: string
  itemId: string | null
  itemName: string
  itemType: string | null
  category: string | null
  unit: string
  qty: number
  cost: number
  usageType: UsageKey
  ref: { kind: 'TR' | 'GR' | 'COUNT' | 'POS' | 'OTHER'; number: string | null; id: string | null; poNumber?: string | null }
  byDate: boolean
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const thisYear = new Date().getFullYear()
  const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get('year') ?? '') || thisYear))
  const itemType = searchParams.get('type') || ''

  const [yachts, itemTypes] = await withRetry(db, () => Promise.all([
    db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.purchaseItemTypeConfig.findMany({ where: { isActive: true }, select: { code: true, label: true }, orderBy: { label: 'asc' } }),
  ]))
  const yachtId = searchParams.get('yachtId') || yachts[0]?.id
  if (!yachtId) return NextResponse.json({ year, yachtId: null, yachts, itemTypes, trips: [], unassigned: [] })

  const start = new Date(Date.UTC(year, 0, 1))
  const end = new Date(Date.UTC(year + 1, 0, 1))

  const [openTrips, charters] = await withRetry(db, () => Promise.all([
    db.openTrip.findMany({
      where: { yachtId, endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      select: {
        id: true, title: true, startDate: true, endDate: true, tripNumber: true, status: true, closedReason: true,
        bookings: { where: { status: { not: 'cancelled' } }, select: { guestCount: true } },
      },
    }),
    db.booking.findMany({
      where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      select: { id: true, bookingCode: true, startDate: true, endDate: true, tripNumber: true, guestCount: true, customer: { select: { name: true } } },
    }),
  ]))
  const { isAbsorbed, resolve } = buildTripResolver(openTrips, charters)

  const movementSelect = {
    usageType: true, totalCost: true, quantity: true, createdAt: true, openTripId: true, tripBookingId: true,
    referenceId: true, referenceType: true, itemId: true, itemName: true,
    item: { select: { name: true, baseUnit: true, type: true, category: true } },
  } as const
  // Spare parts that reached this ship this year — its maintenance cost, not any trip's.
  const maintenanceMovements = await withRetry(db, () => db.stockMovement.findMany({
    where: { usageType: 'MAINTENANCE', yachtId, createdAt: { gte: start, lt: end }, ...(itemType ? { item: { type: itemType } } : {}) },
    select: movementSelect,
    orderBy: { createdAt: 'asc' },
  }))
  const movements = await withRetry(db, () => db.stockMovement.findMany({
    where: {
      usageType: { in: [...TRIP_USAGE_TYPES] },
      ...(itemType ? { item: { type: itemType } } : {}),
      OR: [
        { openTripId: { in: openTrips.map(t => t.id) } },
        { tripBookingId: { in: charters.map(c => c.id) } },
        { yachtId, openTripId: null, tripBookingId: null, createdAt: { gte: start, lt: end } },
      ],
    },
    select: movementSelect,
    orderBy: { createdAt: 'asc' },
  }))

  // Document numbers for each movement's source.
  const idsOf = (t: string) => [...new Set([...movements, ...maintenanceMovements].filter(m => m.referenceType === t && m.referenceId).map(m => m.referenceId!))]
  const [transfers, receipts, counts] = await withRetry(db, () => Promise.all([
    db.stockTransfer.findMany({ where: { id: { in: idsOf('StockTransfer') } }, select: { id: true, transferNumber: true } }),
    db.goodsReceipt.findMany({ where: { id: { in: idsOf('GoodsReceipt') } }, select: { id: true, grNumber: true, order: { select: { id: true, poNumber: true } } } }),
    db.stockCount.findMany({ where: { id: { in: idsOf('STOCK_COUNT') } }, select: { id: true, countNumber: true } }),
  ]))
  const trMap = new Map(transfers.map(t => [t.id, t.transferNumber]))
  const grMap = new Map(receipts.map(r => [r.id, r]))
  const countMap = new Map(counts.map(c => [c.id, c.countNumber]))

  const refOf = (m: (typeof movements)[number]): TripUsageLine['ref'] => {
    const id = m.referenceId
    switch (m.referenceType) {
      case 'StockTransfer': return { kind: 'TR', number: (id && trMap.get(id)) ?? null, id }
      case 'GoodsReceipt': {
        const gr = id ? grMap.get(id) : undefined
        return { kind: 'GR', number: gr?.grNumber ?? null, id: gr?.order.id ?? null, poNumber: gr?.order.poNumber ?? null }
      }
      case 'STOCK_COUNT': return { kind: 'COUNT', number: (id && countMap.get(id)) ?? null, id }
      case 'CashierSale': return { kind: 'POS', number: null, id: null }
      default: return { kind: 'OTHER', number: null, id: null }
    }
  }

  const linesByTrip = new Map<string, TripUsageLine[]>()
  const unassigned: TripUsageLine[] = []
  const posIndex = new Map<string, TripUsageLine>() // `${tripId}|${type}|${item}|${day}`
  const toLine = (m: (typeof movements)[number], byDate: boolean): TripUsageLine => {
    const cost = m.totalCost ?? 0
    return {
      date: m.createdAt.toISOString(),
      itemId: m.itemId,
      itemName: m.item?.name ?? m.itemName ?? '—',
      itemType: m.item?.type ?? null,
      category: m.item?.category ?? null,
      unit: m.item?.baseUnit ?? '',
      // Reversals carry a negative totalCost but a positive quantity.
      qty: cost < 0 ? -m.quantity : m.quantity,
      cost,
      usageType: m.usageType as UsageKey,
      ref: refOf(m),
      byDate,
    }
  }
  for (const m of movements) {
    const { tripId, byDate } = resolve(m)
    const line = toLine(m, byDate)
    const ref = line.ref
    const day = m.createdAt.toISOString().slice(0, 10)
    if (ref.kind === 'POS') {
      const key = `${tripId ?? '-'}|${line.usageType}|${line.itemId ?? line.itemName}|${day}|${byDate}`
      const prev = posIndex.get(key)
      if (prev) { prev.qty += line.qty; prev.cost += line.cost; continue }
      posIndex.set(key, line)
    }
    if (!tripId) { unassigned.push(line); continue }
    const list = linesByTrip.get(tripId) ?? []
    list.push(line)
    linesByTrip.set(tripId, list)
  }

  // pax × days feeds Order Pattern's per-guest-per-day rate; days = nights + 1 like the Trip Sheet.
  const days = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000)) + 1
  const trips = [
    ...openTrips.filter(t => !isAbsorbed(t)).map(t => ({
      id: t.id, kind: 'OPEN_TRIP' as const, label: t.title, tripNumber: t.tripNumber, startDate: t.startDate, endDate: t.endDate,
      pax: t.bookings.reduce((s, b) => s + b.guestCount, 0), days: days(t.startDate, t.endDate),
    })),
    ...charters.map(c => ({
      id: c.id, kind: 'PRIVATE_CHARTER' as const, label: `${c.bookingCode} · ${c.customer.name}`, tripNumber: c.tripNumber, startDate: c.startDate, endDate: c.endDate,
      pax: c.guestCount, days: days(c.startDate, c.endDate),
    })),
  ]
    .sort((a, b) => (a.tripNumber ?? 1e9) - (b.tripNumber ?? 1e9) || a.startDate.getTime() - b.startDate.getTime())
    .map(t => {
      const lines = linesByTrip.get(t.id) ?? []
      return { ...t, lines, total: lines.reduce((s, l) => s + l.cost, 0) }
    })

  const maintenance = maintenanceMovements.map(m => toLine(m, false))
  return NextResponse.json({ year, yachtId, yachts, itemTypes, trips, unassigned, maintenance })
}
