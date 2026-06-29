import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null

  const from = year ? new Date(year, 0, 1) : new Date(new Date().getFullYear() - 2, 0, 1)
  const to   = year ? new Date(year, 11, 31, 23, 59, 59) : new Date()

  // All received transfers in range
  const transfers = await db.stockTransfer.findMany({
    where: {
      status: 'RECEIVED',
      receivedAt: { gte: from, lte: to },
    },
    orderBy: { receivedAt: 'desc' },
    include: {
      fromLocation: { select: { id: true, name: true, type: true } },
      toLocation:   { select: { id: true, name: true, type: true } },
      items: {
        include: { item: { select: { standardCost: true, category: true } } },
      },
    },
  })

  // Available years for filter
  const allTransfers = await db.stockTransfer.findMany({
    where: { status: 'RECEIVED', receivedAt: { not: null } },
    select: { receivedAt: true },
  })
  const years = [...new Set(allTransfers.map(t => new Date(t.receivedAt!).getFullYear()))].sort((a, b) => b - a)

  // Build flat rows
  type Row = {
    transferId:   string
    transferNumber: string
    date:         Date
    fromLocation: string
    toLocation:   string
    toLocationType: string
    itemName:     string
    category:     string | null
    receivedQty:  number
    unitCost:     number
    totalValue:   number
    receivedBy:   string | null
  }

  const rows: Row[] = transfers.flatMap(t =>
    t.items.map(i => ({
      transferId:     t.id,
      transferNumber: t.transferNumber,
      date:           t.receivedAt!,
      fromLocation:   t.fromLocation.name,
      toLocation:     t.toLocation.name,
      toLocationType: t.toLocation.type,
      itemName:       i.itemName,
      category:       i.item?.category ?? null,
      receivedQty:    i.receivedQty,
      unitCost:       i.item?.standardCost ?? 0,
      totalValue:     i.receivedQty * (i.item?.standardCost ?? 0),
      receivedBy:     t.receivedByName ?? null,
    }))
  )

  // Unique locations (vessels) that received
  const vessels = [...new Set(rows.map(r => r.toLocation))].sort()

  // Summary by vessel
  const byVessel: Record<string, { qty: number; value: number }> = {}
  for (const r of rows) {
    if (!byVessel[r.toLocation]) byVessel[r.toLocation] = { qty: 0, value: 0 }
    byVessel[r.toLocation].qty   += r.receivedQty
    byVessel[r.toLocation].value += r.totalValue
  }

  // Monthly breakdown
  const monthlyMap: Record<string, { label: string; year: number; month: number; total: number; value: number; byVessel: Record<string, number> }> = {}
  for (const r of rows) {
    const d = new Date(r.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap[key]) {
      const label = d.toLocaleString('id-ID', { month: 'short', year: 'numeric' })
      const bv: Record<string, number> = {}
      for (const v of vessels) bv[v] = 0
      monthlyMap[key] = { label, year: d.getFullYear(), month: d.getMonth() + 1, total: 0, value: 0, byVessel: bv }
    }
    monthlyMap[key].total += r.receivedQty
    monthlyMap[key].value += r.totalValue
    if (monthlyMap[key].byVessel[r.toLocation] !== undefined)
      monthlyMap[key].byVessel[r.toLocation] += r.receivedQty
    else
      monthlyMap[key].byVessel[r.toLocation] = r.receivedQty
  }
  const monthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)

  // Weekly breakdown (ISO week)
  const getISOWeek = (d: Date) => {
    const tmp = new Date(d)
    tmp.setHours(0, 0, 0, 0)
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const week1 = new Date(tmp.getFullYear(), 0, 4)
    return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  }
  const weeklyMap: Record<string, { label: string; year: number; week: number; total: number; value: number; byVessel: Record<string, number> }> = {}
  for (const r of rows) {
    const d = new Date(r.date)
    const wk = getISOWeek(d)
    const key = `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`
    if (!weeklyMap[key]) {
      const bv: Record<string, number> = {}
      for (const v of vessels) bv[v] = 0
      weeklyMap[key] = { label: `Week ${wk}, ${d.getFullYear()}`, year: d.getFullYear(), week: wk, total: 0, value: 0, byVessel: bv }
    }
    weeklyMap[key].total += r.receivedQty
    weeklyMap[key].value += r.totalValue
    if (weeklyMap[key].byVessel[r.toLocation] !== undefined)
      weeklyMap[key].byVessel[r.toLocation] += r.receivedQty
    else
      weeklyMap[key].byVessel[r.toLocation] = r.receivedQty
  }
  const weekly = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)

  // Detail rows per vessel (for "By Vessel" tab)
  const detailByVessel: Record<string, Row[]> = {}
  for (const r of rows) {
    if (!detailByVessel[r.toLocation]) detailByVessel[r.toLocation] = []
    detailByVessel[r.toLocation].push(r)
  }

  const totalQty   = rows.reduce((s, r) => s + r.receivedQty, 0)
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0)

  return NextResponse.json({
    years,
    vessels,
    byVessel,
    monthly,
    weekly,
    detailByVessel,
    totalQty,
    totalValue,
    rowCount: rows.length,
  })
}
