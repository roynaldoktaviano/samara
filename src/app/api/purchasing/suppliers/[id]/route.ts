import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [supplier, orders] = await Promise.all([
    db.supplier.findUnique({ where: { id } }),
    db.purchaseOrder.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { orderedQty: true, unitCost: true } } },
    }),
  ])
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const history = orders.map(o => ({
    id: o.id,
    poNumber: o.poNumber,
    status: o.status,
    orderedAt: o.orderedAt,
    expectedAt: o.expectedAt,
    itemCount: o.items.length,
    totalValue: o.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0),
  }))

  const totalSpend = history.reduce((s, o) => s + o.totalValue, 0)
  const totalOrders = history.length

  return NextResponse.json({ ...supplier, history, totalSpend, totalOrders })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { name, locations, contact, phone, email, notes, isActive } = await req.json()
  if (name !== undefined && !name?.trim()) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
  const supplier = await db.supplier.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(locations !== undefined && { locations: Array.isArray(locations) ? locations : [] }),
      ...(contact !== undefined && { contact: contact?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    },
  })
  return NextResponse.json(supplier)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const hasOrders = await db.purchaseOrder.findFirst({ where: { supplierId: id } })
  if (hasOrders) return NextResponse.json({ error: 'Cannot delete supplier with existing orders' }, { status: 409 })
  await db.supplier.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
