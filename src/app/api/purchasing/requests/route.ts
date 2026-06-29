import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

async function generatePrNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const prefix = `PR-${year}${month}-`
  const last = await db.purchaseRequest.findFirst({
    where: { prNumber: { startsWith: prefix } },
    orderBy: { prNumber: 'desc' },
    select: { prNumber: true },
  })
  const seq = last ? (parseInt(last.prNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const requests = await db.purchaseRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, quantity: true, estimatedCost: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
    },
  })
  const userIds = [...new Set(requests.map(r => r.requestedById))]
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = new Map(users.map(u => [u.id, u]))
  return NextResponse.json(
    requests.map(r => ({
      ...r,
      itemCount: r.items.length,
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
      requestedBy: userMap.get(r.requestedById) ?? null,
      items: undefined,
    })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { deliveryLocationId, notes, items } = body
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })
  }
  const prNumber = await generatePrNumber(db)
  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById: session.user.id,
      deliveryLocationId: deliveryLocationId || null,
      notes: notes?.trim() || null,
      status: 'DRAFT',
      updatedAt: new Date(),
      items: {
        create: items.map((it: { itemId?: string; itemName: string; quantity: number; unit: string; estimatedCost?: number; supplierId?: string; supplierName?: string; notes?: string }) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          estimatedCost: Number(it.estimatedCost) || 0,
          supplierId: it.supplierId || null,
          supplierName: it.supplierName?.trim() || null,
          notes: it.notes?.trim() || null,
        })),
      },
    },
    include: { items: true },
  })
  return NextResponse.json(request, { status: 201 })
}
