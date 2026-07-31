import { NextRequest, NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import { receiveGoods } from '@/lib/purchasing/receiveGoods'

// No-login, per-PO token link crew on a yacht use to confirm receiving a PurchaseOrder's
// goods — see src/app/po-receive/[token]/page.tsx. Mirrors
// src/app/api/crew-receive/[token]/route.ts: there's no session here to know which tenant DB
// to use, so the token is looked up by scanning tenants via resolveTenantByLookup. Unlike a
// StockTransfer (one-shot DISPATCHED -> RECEIVED), a PO can be received in several partial
// deliveries, so this link stays usable across multiple submissions until the PO reaches
// status RECEIVED.
async function findOrder(client: PrismaClient, token: string) {
  return client.purchaseOrder.findUnique({
    where: { receiveToken: token },
    select: {
      id: true, poNumber: true, supplierName: true, status: true, receiveTokenExpiresAt: true,
      deliveryLocationId: true,
      createdById: true,
      deliveryLocation: { select: { name: true } },
      transitStops: { orderBy: { sequence: 'asc' }, take: 1, select: { locationId: true, location: { select: { name: true } } } },
      items: { select: { id: true, itemId: true, itemName: true, unit: true, orderedQty: true, receivedQty: true } },
    },
  })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => findOrder(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: order } = found
  if (order.receiveTokenExpiresAt && new Date(order.receiveTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }

  const firstStop = order.transitStops[0]
  const locationName = firstStop ? firstStop.location.name : order.deliveryLocation?.name ?? null
  const effectiveLocationId = firstStop ? firstStop.locationId : order.deliveryLocationId

  const employeesAtLocation = effectiveLocationId
    ? await db.employee.findMany({ where: { locationId: effectiveLocationId, isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } })
    : []
  const employees = employeesAtLocation.length
    ? employeesAtLocation
    : await db.employee.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } })

  return NextResponse.json({
    id: order.id,
    poNumber: order.poNumber,
    supplierName: order.supplierName,
    status: order.status,
    locationName,
    items: order.items.map(it => ({ ...it, remaining: Math.max(0, it.orderedQty - it.receivedQty) })),
    employees,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await resolveTenantByLookup(client => findOrder(client, token))
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: order } = found
  if (order.receiveTokenExpiresAt && new Date(order.receiveTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 })
  }
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(order.status)) {
    return NextResponse.json({ error: 'PO ini sudah selesai diterima' }, { status: 409 })
  }
  if (!order.createdById) return NextResponse.json({ error: 'PO ini belum punya catatan pembuat yang valid' }, { status: 400 })
  if (!order.deliveryLocationId) return NextResponse.json({ error: 'PO ini belum punya lokasi tujuan' }, { status: 400 })

  const body = await req.json()
  const { receivedByEmployeeId, receivePhotoKey, notes, items } = body as {
    receivedByEmployeeId?: string
    receivePhotoKey?: string
    notes?: string
    items?: { poItemId?: string; itemId?: string | null; itemName: string; unit?: string; receivedQty: number }[]
  }
  if (!receivedByEmployeeId) return NextResponse.json({ error: 'Nama penerima wajib diisi' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })

  const employee = await db.employee.findUnique({ where: { id: receivedByEmployeeId }, select: { id: true, fullName: true } })
  if (!employee) return NextResponse.json({ error: 'Karyawan tidak ditemukan' }, { status: 400 })

  const result = await receiveGoods(db, {
    orderId: order.id,
    locationId: order.deliveryLocationId,
    notes,
    receivePhotoKey,
    receiverName: employee.fullName,
    receivedById: null,
    receivedByEmployeeId: employee.id,
    movementCreatedById: order.createdById,
    items: items.map(it => ({ itemId: it.itemId || null, poItemId: it.poItemId || null, itemName: it.itemName, unit: it.unit, receivedQty: Number(it.receivedQty) || 0 })),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
