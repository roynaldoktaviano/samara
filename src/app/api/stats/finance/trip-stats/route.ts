import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'
import { roleMatches } from '@/lib/role-utils'
import { getAgentCommissionPct } from '@/lib/agent-commission'

// Per-yacht, per-year trip recap in the same layout Finance keeps in Excel: one row per trip
// number (Open Trip or Private Charter, see renumberTripYear()), with revenue, agent fee,
// and DP / Pelunasan received split by the currency each payment was made in.
// Year bucket = endDate year, same as the trip-number sequence.
//
// Payment.amount is always the USD baseline; currency/exchangeRate are display metadata, so
// an IDR payment's rupiah value is amount × exchangeRate.
//
// Trip cost = usage (pemakaian) from the StockMovement usage ledger, in Rupiah (moving-average
// cost). A movement is charged to the trip it's linked to (openTripId / tripBookingId, set from
// the Transfer / PO trip picker); an unlinked one falls back by date to the trip on that yacht
// running when it happened, else the next one to depart (supplies loaded ahead of a trip).
// Anything left over is reported as unassigned. Payment of the PO is cash flow, never cost here.

const USAGE_TYPES = ['SHIP_USAGE', 'BAR_COGS', 'COMPLIMENTARY', 'SHRINKAGE'] as const
type UsageKey = (typeof USAGE_TYPES)[number]
const emptyCost = () => ({ SHIP_USAGE: 0, BAR_COGS: 0, COMPLIMENTARY: 0, SHRINKAGE: 0, total: 0 } as Record<UsageKey | 'total', number>)

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const bookingSelect = {
  id: true, bookingCode: true, source: true, tripType: true, useB2BCommission: true,
  startDate: true, endDate: true, finalDueDate: true, guestCount: true, totalPrice: true,
  currency: true, exchangeRate: true, notes: true,
  customer: { select: { name: true } },
  agent: { select: { name: true, commissionOpenTrip: true, commissionPrivateCharter: true, commissionB2B: true } },
  salesperson: true,
  salespersonUser: { select: { name: true } },
  services: { select: { price: true, quantity: true } },
  guests: { select: { cabinId: true, isLead: true, customer: { select: { name: true } } } },
  payments: {
    where: { status: 'confirmed' as const },
    select: { paymentType: true, amount: true, currency: true, exchangeRate: true, paymentDate: true, confirmedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'FINANCE'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const thisYear = new Date().getFullYear()
  const year = Math.max(2000, Math.min(2100, parseInt(searchParams.get('year') ?? '') || thisYear))
  const yachts = await withRetry(db, () => db.yacht.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }))
  const yachtId = searchParams.get('yachtId') || yachts[0]?.id
  if (!yachtId) return NextResponse.json({ year, yachtId: null, yachts, trips: [] })

  const start = new Date(Date.UTC(year, 0, 1))
  const end   = new Date(Date.UTC(year + 1, 0, 1))

  try {
    const [openTrips, charters] = await withRetry(db, () => Promise.all([
      db.openTrip.findMany({
        where: { yachtId, endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: {
          id: true, title: true, startDate: true, endDate: true, tripNumber: true, status: true, closedReason: true,
          bookings: { where: { status: { not: 'cancelled' } }, select: bookingSelect, orderBy: { createdAt: 'asc' } },
        },
      }),
      db.booking.findMany({
        where: { yachtId, tripType: 'PRIVATE_CHARTER', endDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { ...bookingSelect, tripNumber: true },
      }),
    ]))

    // Open Trips absorbed into a Private Charter have no number of their own — the charter's
    // row stands for them (same rule as renumberTripYear()).
    const isAbsorbed = (t: { status: string; closedReason: string | null }) =>
      t.status === 'closed' && !!t.closedReason &&
      charters.some(c => t.closedReason!.trimEnd().endsWith(` ${c.bookingCode}`))

    type B = (typeof charters)[number] | (typeof openTrips)[number]['bookings'][number]

    type RowOpts = { id: string; kind: 'OPEN_TRIP' | 'PRIVATE_CHARTER'; label: string; tripNumber: number | null; startDate: Date; endDate: Date; status?: string; bookings: B[] }
    const computeRow = (opts: RowOpts) => {
      const nights = Math.max(0, Math.round((opts.endDate.getTime() - opts.startDate.getTime()) / 86400000))
      const clients = new Set<string>(), salesmen = new Set<string>(), cabins = new Set<string>()
      let pax = 0, amount = 0, tnk = 0, agentFee = 0
      let usdDp = 0, usdPel = 0, idrDp = 0, idrPel = 0, idrPaidUsd = 0
      let usdDpDate: Date | null = null, usdPelDate: Date | null = null, idrDpDate: Date | null = null, idrPelDate: Date | null = null
      let hasAgent = false, hasDirect = false, isIdr = false
      let forex: number | null = null, dueDate: Date | null = null
      const notes: string[] = []

      for (const b of opts.bookings) {
        const lead = b.guests.find(g => g.isLead)?.customer?.name ?? b.customer.name
        clients.add(lead)
        salesmen.add(b.salespersonUser?.name ?? b.salesperson ?? '')
        b.guests.forEach(g => g.cabinId && cabins.add(g.cabinId))
        pax += b.guestCount

        // Same split as the Trip Sheet: totalPrice is already net of discount and includes
        // services (TNK); commission applies to the trip portion only.
        const svc  = b.services.reduce((s, x) => s + x.price * (x.quantity ?? 1), 0)
        const trip = Math.max(0, b.totalPrice - svc)
        const pct  = b.source === 'AGENT' ? getAgentCommissionPct(b.agent, b.tripType, b.useB2BCommission) : 0
        amount   += trip
        tnk      += svc
        agentFee += trip * Math.max(0, Math.min(pct, 100)) / 100
        if (b.source === 'AGENT') hasAgent = true; else hasDirect = true

        if (b.currency === 'IDR') { isIdr = true; if (b.exchangeRate) forex = b.exchangeRate }
        if (b.finalDueDate && (!dueDate || b.finalDueDate > dueDate)) dueDate = b.finalDueDate
        if (b.notes?.trim()) notes.push(b.notes.trim())

        for (const p of b.payments) {
          const when = p.paymentDate ?? p.confirmedAt ?? p.createdAt
          const isDp = p.paymentType !== 'PELUNASAN'
          if (p.currency === 'IDR' && p.exchangeRate) {
            const idr = p.amount * p.exchangeRate
            idrPaidUsd += p.amount
            if (isDp) { idrDp += idr; if (!idrDpDate || when > idrDpDate) idrDpDate = when }
            else      { idrPel += idr; if (!idrPelDate || when > idrPelDate) idrPelDate = when }
            forex = forex ?? p.exchangeRate
          } else {
            if (isDp) { usdDp += p.amount; if (!usdDpDate || when > usdDpDate) usdDpDate = when }
            else      { usdPel += p.amount; if (!usdPelDate || when > usdPelDate) usdPelDate = when }
          }
        }
      }

      const total = amount + tnk
      const net   = total - agentFee
      const paidUsd = usdDp + usdPel + idrPaidUsd
      const balanceUsd = opts.bookings.length ? Math.max(0, net - paidUsd) : 0

      return {
        id: opts.id,
        kind: opts.kind,
        label: opts.label,
        closed: opts.status === 'closed',
        tripNumber: opts.tripNumber,
        startDate: opts.startDate,
        endDate: opts.endDate,
        dn: `${nights + 1}D${nights}N`,
        days: nights + 1,
        client: [...clients].join(', '),
        pax,
        rooms: cabins.size,
        salesman: [...salesmen].filter(Boolean).join(', '),
        source: !opts.bookings.length ? '' : hasAgent && hasDirect ? 'Mixed' : hasAgent ? 'Agent' : 'Direct',
        period: monthKey(opts.endDate),
        amount, tnk, total, agentFee, net,
        forex,
        currency: isIdr ? 'IDR' : 'USD',
        rupiah: isIdr && forex ? net * forex : null,
        usd: {
          dpPeriod: usdDpDate ? monthKey(usdDpDate) : null, dp: usdDp,
          pelPeriod: usdPelDate ? monthKey(usdPelDate) : null, pel: usdPel,
          balance: isIdr ? 0 : balanceUsd,
        },
        idr: {
          dpPeriod: idrDpDate ? monthKey(idrDpDate) : null, dp: idrDp,
          pelPeriod: idrPelDate ? monthKey(idrPelDate) : null, pel: idrPel,
          balance: isIdr && forex ? balanceUsd * forex : 0,
          paidUsd: idrPaidUsd,
          balanceUsd: isIdr ? balanceUsd : 0,
        },
        balanceUsd,
        paidUsd,
        dueMonth: balanceUsd > 0 ? monthKey(dueDate ?? opts.startDate) : null,
        remark: notes.join(' · '),
        payments: opts.bookings.flatMap(b => b.payments.map(p => ({
          type: p.paymentType === 'PELUNASAN' ? 'PELUNASAN' : 'DP',
          amountUsd: p.amount,
          month: monthKey(p.paymentDate ?? p.confirmedAt ?? p.createdAt),
        }))),
      }
    }

    // One line per booking inside a trip, so a shared Open Trip lists each sale separately
    // (its own client, salesman, Agent/Direct, payments) instead of one merged "Mixed" row.
    const buildRow = (opts: RowOpts) => ({
      ...computeRow(opts),
      ...costOf(opts.id),
      lines: opts.bookings.map(b => ({ bookingCode: b.bookingCode, ...computeRow({ ...opts, bookings: [b] }) })),
    })

    // ── Usage cost per trip ──
    // Absorbed Open Trips' usage belongs to the charter row that stands for them.
    const absorbedInto = new Map<string, string>()
    for (const t of openTrips) {
      if (t.status !== 'closed' || !t.closedReason) continue
      const c = charters.find(c => t.closedReason!.trimEnd().endsWith(` ${c.bookingCode}`))
      if (c) absorbedInto.set(t.id, c.id)
    }
    const windows = [
      ...openTrips.filter(t => !isAbsorbed(t)).map(t => ({ id: t.id, startDate: t.startDate, endDate: t.endDate })),
      ...charters.map(c => ({ id: c.id, startDate: c.startDate, endDate: c.endDate })),
    ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    const tripByDate = (when: Date) => {
      const day = dayStart(when)
      return windows.find(w => day >= dayStart(w.startDate) && day <= dayStart(w.endDate))
        ?? windows.find(w => dayStart(w.startDate) > day)
    }

    const movements = await withRetry(db, () => db.stockMovement.findMany({
      where: {
        usageType: { not: null },
        OR: [
          { openTripId: { in: openTrips.map(t => t.id) } },
          { tripBookingId: { in: charters.map(c => c.id) } },
          { yachtId, openTripId: null, tripBookingId: null, createdAt: { gte: start, lt: end } },
        ],
      },
      select: {
        usageType: true, totalCost: true, quantity: true, createdAt: true, openTripId: true, tripBookingId: true,
        itemId: true, itemName: true, item: { select: { name: true, baseUnit: true } },
      },
    }))

    type CostItem = { name: string; unit: string; qty: number; cost: number; byDate: boolean; usageType: UsageKey }
    const costByTrip = new Map<string, { cost: ReturnType<typeof emptyCost>; items: Map<string, CostItem> }>()
    const unassigned = emptyCost()
    for (const m of movements) {
      const type = m.usageType as UsageKey
      const cost = m.totalCost ?? 0
      const linked = m.openTripId ? (absorbedInto.get(m.openTripId) ?? m.openTripId) : m.tripBookingId
      const tripId = linked && windows.some(w => w.id === linked) ? linked : (!linked ? tripByDate(m.createdAt)?.id : undefined)
      if (!tripId) { unassigned[type] += cost; unassigned.total += cost; continue }
      const entry = costByTrip.get(tripId) ?? { cost: emptyCost(), items: new Map() }
      costByTrip.set(tripId, entry)
      entry.cost[type] += cost
      entry.cost.total += cost
      const name = m.item?.name ?? m.itemName ?? '—'
      const key = `${type}|${m.itemId ?? name}|${linked ? 'L' : 'D'}`
      const it = entry.items.get(key) ?? { name, unit: m.item?.baseUnit ?? '', qty: 0, cost: 0, byDate: !linked, usageType: type }
      // Reversals carry a negative totalCost but a positive quantity.
      it.qty += cost < 0 ? -m.quantity : m.quantity
      it.cost += cost
      entry.items.set(key, it)
    }
    const costOf = (id: string) => {
      const e = costByTrip.get(id)
      return {
        cost: e?.cost ?? emptyCost(),
        costItems: e ? [...e.items.values()].sort((a, b) => b.cost - a.cost) : [],
      }
    }

    // Default USD→IDR rate for converting revenue when comparing it to Rupiah cost: the most
    // recent confirmed IDR payment's rate. The UI lets Finance override it.
    const lastIdr = await withRetry(db, () => db.payment.findFirst({
      where: { status: 'confirmed', currency: 'IDR', exchangeRate: { gt: 0 } },
      orderBy: { createdAt: 'desc' }, select: { exchangeRate: true },
    }))

    const rows = [
      ...openTrips.filter(t => !isAbsorbed(t)).map(t => buildRow({
        id: t.id, kind: 'OPEN_TRIP', label: t.title, tripNumber: t.tripNumber, status: t.status,
        startDate: t.startDate, endDate: t.endDate, bookings: t.bookings,
      })),
      ...charters.map(c => buildRow({
        id: c.id, kind: 'PRIVATE_CHARTER', label: c.bookingCode, tripNumber: c.tripNumber,
        startDate: c.startDate, endDate: c.endDate, bookings: [c],
      })),
    ].sort((a, b) => (a.tripNumber ?? 1e9) - (b.tripNumber ?? 1e9) || a.startDate.getTime() - b.startDate.getTime())

    return NextResponse.json({ year, yachtId, yachts, trips: rows, unassignedCost: unassigned, defaultForex: lastIdr?.exchangeRate ?? null })
  } catch (error) {
    console.error('Error building trip stats:', error)
    return NextResponse.json({ error: 'Failed to build trip stats' }, { status: 500 })
  }
}
