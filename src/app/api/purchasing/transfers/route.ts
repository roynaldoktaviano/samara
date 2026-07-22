import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

async function generateTrNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.stockTransfer.findFirst({ where: { transferNumber: { startsWith: prefix } }, orderBy: { transferNumber: 'desc' }, select: { transferNumber: true } })
  const seq = last ? (parseInt(last.transferNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const transfers = await db.stockTransfer.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { id: true, itemName: true, requestedQty: true, dispatchedQty: true, receivedQty: true, item: { select: { standardCost: true } } } } },
  })
  const locIds = [...new Set([...transfers.map(t => t.fromLocationId), ...transfers.map(t => t.toLocationId)])]
  const locations = await db.stockLocation.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true, type: true } })
  const locMap = new Map(locations.map(l => [l.id, l]))
  return NextResponse.json(transfers.map(t => {
    const first = t.items[0]?.itemName ?? null
    const extra = t.items.length > 1 ? t.items.length - 1 : 0
    const contents = first ? (extra > 0 ? `${first} +${extra} more` : first) : null
    const valueQty = (i: typeof t.items[number]) => t.status === 'PENDING' ? i.requestedQty : t.status === 'DISPATCHED' ? i.dispatchedQty : i.receivedQty
    const totalValue = t.items.reduce((sum, i) => sum + valueQty(i) * (i.item?.standardCost ?? 0), 0)
    return {
      ...t,
      itemCount: t.items.length,
      items: undefined,
      contents,
      totalValue,
      hasDispatchPhoto: !!t.dispatchPhotoKey,
      hasReceivePhoto: !!t.receivePhotoKey,
      fromLocation: locMap.get(t.fromLocationId) ?? null,
      toLocation: locMap.get(t.toLocationId) ?? null,
    }
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { fromLocationId, toLocationId, notes, items } = body
  if (!fromLocationId || !toLocationId) return NextResponse.json({ error: 'Lokasi asal dan tujuan wajib dipilih' }, { status: 400 })
  if (fromLocationId === toLocationId) return NextResponse.json({ error: 'Lokasi asal dan tujuan tidak boleh sama' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })

  // Validate stock availability — non-catalog ("non-stock") items can have
  // several lots at once (one per receiving PO, see receipts/route.ts), so
  // availability is the sum across all of them, not a single lot's quantity.
  for (const it of items) {
    if (it.itemId) {
      const lot = await db.stockLot.findFirst({ where: { itemId: it.itemId, locationId: fromLocationId } })
      if (!lot || lot.quantity < Number(it.requestedQty)) {
        return NextResponse.json({ error: `Stok "${it.itemName}" tidak cukup (tersedia: ${lot?.quantity ?? 0})` }, { status: 409 })
      }
    } else {
      const lots = await db.stockLot.findMany({ where: { itemId: null, itemName: it.itemName, locationId: fromLocationId } })
      const available = lots.reduce((s, l) => s + l.quantity, 0)
      if (available < Number(it.requestedQty)) {
        return NextResponse.json({ error: `Stok "${it.itemName}" tidak cukup (tersedia: ${available})` }, { status: 409 })
      }
    }
  }

  const transferNumber = await generateTrNumber(db)
  const transfer = await db.stockTransfer.create({
    data: {
      id: crypto.randomUUID(),
      transferNumber,
      fromLocationId,
      toLocationId,
      status: 'PENDING',
      notes: notes?.trim() || null,
      updatedAt: new Date(),
      items: {
        create: items.map((it: { itemId?: string; itemName: string; requestedQty: number }) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          requestedQty: Number(it.requestedQty),
        })),
      },
    },
    include: { items: true },
  })
  return NextResponse.json(transfer, { status: 201 })
}
