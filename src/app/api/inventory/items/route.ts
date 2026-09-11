import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { nextVal } from '@/lib/counter'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
// CREW included: they can create Purchase Requests and need to browse the Inventory
// picker there (see src/components/purchasing/requests/RequestsPage.tsx) — read-only.
const VIEW_ALLOWED = [...ALLOWED, 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR', 'CREW']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = req.nextUrl
  const locationId = searchParams.get('locationId') || undefined
  const roomId = searchParams.get('roomId') || undefined
  const categoryId = searchParams.get('categoryId') || undefined
  const search = searchParams.get('search')?.trim() || undefined

  const items = await db.inventoryItem.findMany({
    where: {
      ...(locationId && { locationId }),
      ...(roomId && { roomId }),
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { itemNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    include: {
      category: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, type: true } },
      _count: { select: { opnameEntries: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(items.map(item => ({ ...item, total: item.quantity * item.unitPrice })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const {
    name, categoryId, brand, purchaseDate, webLink, phone, vendorName,
    quantity, unitPrice, notes, photoKeys, sourcePoId, sourcePurchaseItemId,
  } = body as {
    name: string; categoryId: string; brand?: string; purchaseDate?: string
    webLink?: string; phone?: string; vendorName?: string
    quantity?: number; unitPrice?: number; notes?: string; photoKeys?: string[]
    sourcePoId?: string; sourcePurchaseItemId?: string
  }

  if (!name?.trim()) return NextResponse.json({ error: 'Item Name is required' }, { status: 400 })
  if (!categoryId) return NextResponse.json({ error: 'Item Category is required' }, { status: 400 })

  const category = await db.inventoryCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, roomId: true, room: { select: { locationId: true } } },
  })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

  let resolvedVendorName = vendorName?.trim() || null
  let resolvedPurchaseDate = purchaseDate ? new Date(purchaseDate) : null
  if (sourcePoId) {
    const po = await db.purchaseOrder.findUnique({ where: { id: sourcePoId }, select: { supplierName: true, orderedAt: true } })
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 400 })
    if (!resolvedVendorName) resolvedVendorName = po.supplierName
    if (!resolvedPurchaseDate) resolvedPurchaseDate = po.orderedAt
  }

  // Converting an existing (legacy non-stock) PurchaseItem into an InventoryItem — see
  // "Convert to Inventory" in Purchasing > Items. Auto-fill Vendor/Purchase Date from
  // its most recent Goods Receipt when the caller didn't already supply them (mirrors
  // the "Link to PO" auto-fill, without making the user search for the PO again).
  if (sourcePurchaseItemId) {
    const legacyItem = await db.purchaseItem.findUnique({
      where: { id: sourcePurchaseItemId },
      select: { id: true, migratedInventoryItem: { select: { id: true } } },
    })
    if (!legacyItem) return NextResponse.json({ error: 'Source item not found' }, { status: 400 })
    if (legacyItem.migratedInventoryItem) {
      return NextResponse.json({ error: 'This item has already been converted to Inventory' }, { status: 409 })
    }
    if (!resolvedVendorName || !resolvedPurchaseDate) {
      const lastReceipt = await db.goodsReceiptItem.findFirst({
        where: { itemId: sourcePurchaseItemId },
        orderBy: { receipt: { receivedAt: 'desc' } },
        select: { receipt: { select: { receivedAt: true, order: { select: { supplierName: true } } } } },
      })
      if (lastReceipt) {
        if (!resolvedVendorName) resolvedVendorName = lastReceipt.receipt.order.supplierName
        if (!resolvedPurchaseDate) resolvedPurchaseDate = lastReceipt.receipt.receivedAt
      }
    }
  }

  const itemNumber = 'INV-' + String(await nextVal('inventory-item', db)).padStart(4, '0')

  try {
    const item = await db.inventoryItem.create({
      data: {
        id: crypto.randomUUID(),
        itemNumber,
        name: name.trim(),
        categoryId,
        roomId: category.roomId,
        locationId: category.room.locationId,
        brand: brand?.trim() || null,
        purchaseDate: resolvedPurchaseDate,
        webLink: webLink?.trim() || null,
        phone: phone?.trim() || null,
        vendorName: resolvedVendorName,
        quantity: Number(quantity) > 0 ? Math.floor(Number(quantity)) : 1,
        unitPrice: Number(unitPrice) || 0,
        notes: notes?.trim() || null,
        photoKeys: Array.isArray(photoKeys) ? photoKeys.filter(Boolean) : [],
        sourcePoId: sourcePoId || null,
        sourcePurchaseItemId: sourcePurchaseItemId || null,
        createdById: session.user.id,
        updatedAt: new Date(),
      },
      include: {
        category: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, type: true } },
      },
    })
    return NextResponse.json({ ...item, total: item.quantity * item.unitPrice }, { status: 201 })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'This item has already been converted to Inventory' }, { status: 409 })
    }
    throw e
  }
}
