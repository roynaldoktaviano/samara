import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

async function generatePoNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } })
  const seq = last ? (parseInt(last.poNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const orders = await db.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, orderedQty: true, receivedQty: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      receipts: {
        orderBy: { receivedAt: 'desc' },
        take: 1,
        select: { receivedAt: true, receivedBy: { select: { name: true } } },
      },
    },
  })
  return NextResponse.json(orders.map(o => {
    const totalOrdered = o.items.reduce((s, i) => s + i.orderedQty, 0)
    const totalReceived = o.items.reduce((s, i) => s + i.receivedQty, 0)
    const fullyReceivedCount = o.items.filter(i => i.receivedQty >= i.orderedQty).length
    return {
      ...o,
      itemCount: o.items.length,
      totalOrdered,
      totalReceived,
      fullyReceivedCount,
      items: undefined,
      lastReceivedAt: o.receipts[0]?.receivedAt ?? null,
      lastReceivedBy: o.receipts[0]?.receivedBy?.name ?? null,
      receipts: undefined,
    }
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { requestId, supplierName, deliveryLocationId, expectedAt, notes, items } = body
  if (!supplierName) return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })
  const poNumber = await generatePoNumber(db)
  const order = await db.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber,
      requestId: requestId || null,
      supplierName: supplierName.trim(),
      deliveryLocationId: deliveryLocationId || null,
      status: 'ORDERED',
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      notes: notes?.trim() || null,
      updatedAt: new Date(),
      items: {
        create: items.map((it: { itemId?: string; itemName: string; orderedQty: number; unitCost?: number }) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          orderedQty: Number(it.orderedQty),
          unitCost: Number(it.unitCost) || 0,
        })),
      },
    },
    include: { items: true },
  })
  if (requestId) {
    await db.purchaseRequest.update({ where: { id: requestId }, data: { status: 'ORDERED', updatedAt: new Date() } }).catch(() => {})
  }
  return NextResponse.json(order, { status: 201 })
}
