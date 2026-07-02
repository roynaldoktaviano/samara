import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const request = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      items: true,
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const itemIds = request.items.map(i => i.itemId).filter(Boolean) as string[]
  const [requesterUser, lots, purchaseItems] = await Promise.all([
    db.user.findUnique({ where: { id: request.requestedById }, select: { id: true, name: true } }),
    itemIds.length ? db.stockLot.findMany({ where: { itemId: { in: itemIds }, quantity: { gt: 0 } }, select: { itemId: true, quantity: true } }) : ([] as { itemId: string | null; quantity: number }[]),
    itemIds.length ? db.purchaseItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, minStock: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } }) : ([] as { id: string; minStock: number; baseUnit: string; purchaseUnit: string; conversionFactor: number }[]),
  ])
  // Requests submitted via the internal Request Order page carry a real requestedByEmployee;
  // prefer that for display, falling back to the ERP user for requests created inside Purchasing.
  const requester = request.requestedByEmployee
    ? { id: request.requestedByEmployee.id, name: `${request.requestedByEmployee.fullName} (${request.requestedByEmployee.employeeNumber})` }
    : requesterUser

  const stockMap = new Map<string, number>()
  for (const lot of lots) {
    if (!lot.itemId) continue
    stockMap.set(lot.itemId, (stockMap.get(lot.itemId) ?? 0) + lot.quantity)
  }
  const itemMasterMap = new Map(purchaseItems.map(i => [i.id, i]))

  const items = request.items.map(item => {
    const master = item.itemId ? itemMasterMap.get(item.itemId) : null
    return {
      ...item,
      currentStock: item.itemId ? (stockMap.get(item.itemId) ?? 0) : null,
      minStock: master?.minStock ?? 0,
      baseUnit: master?.baseUnit ?? null,
      purchaseUnit: master?.purchaseUnit ?? null,
      conversionFactor: master?.conversionFactor ?? 1,
    }
  })

  return NextResponse.json({ ...request, items, requestedBy: requester })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { status } = body
  const valid = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const request = await db.purchaseRequest.update({
    where: { id },
    data: { status, updatedAt: new Date() },
    include: { items: true },
  })

  // Auto-create draft POs grouped by supplier when PR is approved
  if (status === 'APPROVED') {
    const existingDrafts = await db.purchaseOrder.findFirst({ where: { requestId: id, status: 'DRAFT' } })
    if (!existingDrafts) {
      const prefix = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`

      const groups = new Map<string, typeof request.items>()
      for (const item of request.items) {
        const key = item.supplierId || '__none__'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }

      for (const [supplierKey, groupItems] of groups) {
        const last = await db.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } })
        const seq = last ? (parseInt(last.poNumber.split('-').pop() ?? '0') || 0) + 1 : 1
        const poNumber = `${prefix}${String(seq).padStart(3, '0')}`
        const supplierId = supplierKey === '__none__' ? null : supplierKey
        const supplierName = groupItems[0]?.supplierName ?? null
        await db.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            poNumber,
            requestId: id,
            supplierId,
            supplierName,
            deliveryLocationId: request.deliveryLocationId,
            status: 'DRAFT',
            createdById: request.requestedById,
            updatedAt: new Date(),
            items: {
              create: groupItems.map((it) => ({
                id: crypto.randomUUID(),
                itemId: it.itemId ?? null,
                itemName: it.itemName,
                orderedQty: it.quantity,
                unitCost: it.estimatedCost,
              })),
            },
          },
        })
      }
    }
  }

  return NextResponse.json(request)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const existing = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Hanya PR berstatus DRAFT yang bisa dihapus' }, { status: 409 })
  await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
  await db.purchaseRequest.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
