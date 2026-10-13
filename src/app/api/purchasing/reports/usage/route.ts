import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const DAY = 24 * 60 * 60 * 1000

// Usage = stock issued from a warehouse to a ship, minus returns from a ship. History before the
// CariStok import cutoff comes from the imported sheet ledger (referenceType 'CariStokImport', see
// scripts/import-caristok-beverage.ts); after it, from real ERP transfers — never both, so a
// shipment recorded in the sheet and the ERP is not counted twice.
const IMPORT_REF = 'CariStokImport'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const itemType = searchParams.get('type') || 'BEVERAGE'
  const now = new Date()
  const to = searchParams.get('to') ? new Date(searchParams.get('to') + 'T23:59:59') : now
  const from = searchParams.get('from') ? new Date(searchParams.get('from') + 'T00:00:00') : null

  const [items, locations, lastImport] = await Promise.all([
    db.purchaseItem.findMany({
      where: { type: itemType },
      select: { id: true, sku: true, name: true, category: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, standardCost: true, isActive: true },
    }),
    db.stockLocation.findMany({ select: { id: true, name: true, type: true, yacht: { select: { name: true } } } }),
    db.stockMovement.findFirst({ where: { referenceType: IMPORT_REF, item: { type: itemType } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])
  const itemIds = items.map(i => i.id)
  const locMap = new Map(locations.map(l => [l.id, l]))
  const cutoff = lastImport ? new Date(Math.floor(lastImport.createdAt.getTime() / DAY) * DAY + DAY) : null

  const [movements, firstMv, lots] = await Promise.all([
    db.stockMovement.findMany({
      where: {
        itemId: { in: itemIds },
        type: { in: ['TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'] },
        createdAt: { ...(from ? { gte: from } : {}), lte: to },
      },
      select: { itemId: true, type: true, referenceType: true, fromLocationId: true, toLocationId: true, quantity: true, createdAt: true },
    }),
    db.stockMovement.findFirst({ where: { itemId: { in: itemIds } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, locationId: true, quantity: true } }),
  ])

  const isShip = (id: string | null) => !!id && locMap.get(id)?.type === 'VESSEL'
  const shipName = (id: string | null) => (id ? locMap.get(id)?.yacht?.name ?? locMap.get(id)?.name : null) ?? 'Unknown ship'

  type Agg = { issued: number; returned: number; loss: number; byShip: Record<string, number>; lastIssued: Date | null }
  const agg = new Map<string, Agg>()
  const monthly = new Map<string, Record<string, number>>()
  const ships = new Set<string>()
  const get = (id: string) => {
    let a = agg.get(id)
    if (!a) { a = { issued: 0, returned: 0, loss: 0, byShip: {}, lastIssued: null }; agg.set(id, a) }
    return a
  }
  const bump = (itemId: string, ship: string, qty: number, at: Date) => {
    const a = get(itemId)
    a.byShip[ship] = (a.byShip[ship] ?? 0) + qty
    ships.add(ship)
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`
    const m = monthly.get(key) ?? {}
    m[`${ship}|${itemId}`] = (m[`${ship}|${itemId}`] ?? 0) + qty
    monthly.set(key, m)
  }

  for (const m of movements) {
    if (!m.itemId) continue
    const imported = m.referenceType === IMPORT_REF
    if (!imported && cutoff && m.createdAt < cutoff) continue
    if (imported) {
      if (m.type === 'TRANSFER_OUT') { const a = get(m.itemId); a.issued += m.quantity; if (!a.lastIssued || m.createdAt > a.lastIssued) a.lastIssued = m.createdAt; bump(m.itemId, shipName(m.toLocationId), m.quantity, m.createdAt) }
      else if (m.type === 'TRANSFER_IN' && m.fromLocationId) { get(m.itemId).returned += m.quantity; bump(m.itemId, shipName(m.fromLocationId), -m.quantity, m.createdAt) }
      else if (m.type === 'ADJUSTMENT' && m.fromLocationId && !m.toLocationId) get(m.itemId).loss += m.quantity
    } else if (m.type === 'TRANSFER_IN') {
      // Real transfers: one TRANSFER_IN per received line carries both ends.
      if (isShip(m.toLocationId) && !isShip(m.fromLocationId)) { const a = get(m.itemId); a.issued += m.quantity; if (!a.lastIssued || m.createdAt > a.lastIssued) a.lastIssued = m.createdAt; bump(m.itemId, shipName(m.toLocationId), m.quantity, m.createdAt) }
      else if (isShip(m.fromLocationId) && !isShip(m.toLocationId)) { get(m.itemId).returned += m.quantity; bump(m.itemId, shipName(m.fromLocationId), -m.quantity, m.createdAt) }
    }
  }

  // Averages run over the part of the window that actually has data (first ledger entry → today).
  const start = new Date(Math.max(from?.getTime() ?? 0, firstMv?.createdAt.getTime() ?? now.getTime()))
  const end = to < now ? to : now
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY))
  const weeks = days / 7
  const months = days / 30.4375

  const warehouseStock = new Map<string, number>()
  const shipStock = new Map<string, number>()
  for (const l of lots) {
    if (!l.itemId) continue
    const t = locMap.get(l.locationId)?.type
    const target = t === 'WAREHOUSE' ? warehouseStock : t === 'VESSEL' ? shipStock : null
    target?.set(l.itemId, (target.get(l.itemId) ?? 0) + l.quantity)
  }

  const shipList = [...ships].sort()
  const itemById = new Map(items.map(i => [i.id, i]))
  // Quantities are reported in the purchase unit (cartons for Beer Bintang, else pcs) — how the
  // warehouse counts and orders — and valued at standardCost, which is per base unit.
  const rows = items.map(i => {
    const a = agg.get(i.id)
    const f = i.conversionFactor > 0 ? i.conversionFactor : 1
    const net = a ? a.issued - a.returned : 0
    const stock = warehouseStock.get(i.id) ?? 0
    const avgWeek = net / weeks
    return {
      id: i.id, sku: i.sku, name: i.name, category: i.category, isActive: i.isActive,
      unit: f !== 1 ? i.purchaseUnit : i.baseUnit,
      issued: (a?.issued ?? 0) / f,
      returned: (a?.returned ?? 0) / f,
      net: net / f,
      loss: (a?.loss ?? 0) / f,
      value: net * i.standardCost,
      lossValue: (a?.loss ?? 0) * i.standardCost,
      avgWeek: avgWeek / f,
      avgMonth: net / months / f,
      byShip: Object.fromEntries(shipList.map(s => [s, (a?.byShip[s] ?? 0) / f])),
      warehouseStock: stock / f,
      shipStock: (shipStock.get(i.id) ?? 0) / f,
      weeksCover: avgWeek > 0 ? stock / avgWeek : null,
      lastIssued: a?.lastIssued ?? null,
    }
  }).filter(r => r.issued || r.returned || r.loss || r.warehouseStock)

  const monthlyRows = [...monthly.keys()].sort().map(key => {
    const byShip: Record<string, number> = {}
    let value = 0
    let units = 0
    for (const [k, qty] of Object.entries(monthly.get(key)!)) {
      const [ship, itemId] = k.split('|')
      const it = itemById.get(itemId)!
      const f = it.conversionFactor > 0 ? it.conversionFactor : 1
      byShip[ship] = (byShip[ship] ?? 0) + qty / f
      units += qty / f
      value += qty * it.standardCost
    }
    const [y, m] = key.split('-').map(Number)
    return { month: key, label: new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), units, value, byShip }
  })

  const categories = new Map<string, { net: number; value: number }>()
  for (const r of rows) {
    const c = categories.get(r.category) ?? { net: 0, value: 0 }
    c.net += r.net; c.value += r.value
    categories.set(r.category, c)
  }

  const totalNet = rows.reduce((s, r) => s + r.net, 0)
  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  return NextResponse.json({
    range: { from: start, to: end, days, cutoff },
    ships: shipList,
    items: rows,
    monthly: monthlyRows,
    categories: [...categories.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value),
    totals: {
      net: totalNet,
      value: totalValue,
      avgWeek: totalNet / weeks,
      avgMonth: totalNet / months,
      valuePerMonth: totalValue / months,
      loss: rows.reduce((s, r) => s + r.loss, 0),
      lossValue: rows.reduce((s, r) => s + r.lossValue, 0),
      lowCover: rows.filter(r => r.weeksCover !== null && r.weeksCover < 4).length,
    },
  })
}
