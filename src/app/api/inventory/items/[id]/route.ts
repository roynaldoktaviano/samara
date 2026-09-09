import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const VIEW_ALLOWED = [...ALLOWED, 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const item = await db.inventoryItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, type: true } },
      sourcePo: { select: { id: true, poNumber: true, orderedAt: true, supplierName: true } },
      opnameEntries: {
        include: {
          opname: { select: { id: true, opnameNumber: true, createdAt: true, room: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
      replacementRequests: {
        select: {
          id: true, quantity: true, notes: true,
          request: { select: { id: true, prNumber: true, status: true, createdAt: true } },
        },
      },
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ...item, total: item.quantity * item.unitPrice })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const {
    name, categoryId, brand, purchaseDate, webLink, phone, vendorName,
    quantity, unitPrice, notes, photoKeys, sourcePoId, isActive,
  } = body as {
    name?: string; categoryId?: string; brand?: string; purchaseDate?: string | null
    webLink?: string; phone?: string; vendorName?: string
    quantity?: number; unitPrice?: number; notes?: string; photoKeys?: string[]
    sourcePoId?: string | null; isActive?: boolean
  }

  const existing = await db.inventoryItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let roomId: string | undefined
  let locationId: string | undefined
  if (categoryId && categoryId !== existing.categoryId) {
    const category = await db.inventoryCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, roomId: true, room: { select: { locationId: true } } },
    })
    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })
    roomId = category.roomId
    locationId = category.room.locationId
  }

  let resolvedVendorName = vendorName !== undefined ? (vendorName?.trim() || null) : undefined
  let resolvedPurchaseDate = purchaseDate !== undefined ? (purchaseDate ? new Date(purchaseDate) : null) : undefined
  if (sourcePoId) {
    const po = await db.purchaseOrder.findUnique({ where: { id: sourcePoId }, select: { supplierName: true, orderedAt: true } })
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 400 })
    if (!resolvedVendorName) resolvedVendorName = po.supplierName
    if (!resolvedPurchaseDate) resolvedPurchaseDate = po.orderedAt
  }

  const item = await db.inventoryItem.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(categoryId !== undefined && { categoryId }),
      ...(roomId !== undefined && { roomId }),
      ...(locationId !== undefined && { locationId }),
      ...(brand !== undefined && { brand: brand?.trim() || null }),
      ...(resolvedPurchaseDate !== undefined && { purchaseDate: resolvedPurchaseDate }),
      ...(webLink !== undefined && { webLink: webLink?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(resolvedVendorName !== undefined && { vendorName: resolvedVendorName }),
      ...(quantity !== undefined && { quantity: Math.max(1, Math.floor(Number(quantity)) || 1) }),
      ...(unitPrice !== undefined && { unitPrice: Number(unitPrice) || 0 }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(photoKeys !== undefined && { photoKeys: Array.isArray(photoKeys) ? photoKeys.filter(Boolean) : [] }),
      ...(sourcePoId !== undefined && { sourcePoId: sourcePoId || null }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
    include: {
      category: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, type: true } },
    },
  })

  return NextResponse.json({ ...item, total: item.quantity * item.unitPrice })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const item = await db.inventoryItem.findUnique({
    where: { id },
    select: { _count: { select: { opnameEntries: true, replacementRequests: true } } },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item._count.opnameEntries > 0 || item._count.replacementRequests > 0) {
    return NextResponse.json({
      error: 'This item has opname history or replacement requests, cannot be deleted. Deactivate it instead (isActive: false).',
    }, { status: 409 })
  }

  await db.inventoryItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
