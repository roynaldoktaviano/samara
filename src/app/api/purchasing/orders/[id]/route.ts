import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

const ALLOWED       = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const TRANSIT_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: { include: { item: { select: { purchaseUnit: true } } } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      createdBy: { select: { name: true } },
      supplier: { select: { name: true, locations: true, contact: true, phone: true, email: true } },
      request: {
        select: {
          prNumber: true,
          createdAt: true,
          requestedBy: { select: { name: true } },
          requestedByEmployee: { select: { fullName: true, employeeNumber: true } },
        },
      },
      paymentRequests: {
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { name: true } },
          paidBy: { select: { name: true } },
        },
      },
    },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const requestedByName = order.request?.requestedByEmployee
    ? `${order.request.requestedByEmployee.fullName} (${order.request.requestedByEmployee.employeeNumber})`
    : order.request?.requestedBy?.name ?? order.createdBy?.name ?? null

  const receipts = await db.goodsReceipt.findMany({
    where: { orderId: id },
    orderBy: { receivedAt: 'asc' },
    include: { items: true },
  })
  return NextResponse.json({
    ...order,
    receipts,
    requestedByName,
    createdBy: undefined,
    items: order.items.map(it => ({ ...it, unit: it.item?.purchaseUnit ?? it.unit ?? null, item: undefined })),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { status, supplierName, expectedAt, notes, dispatchPhotoKey, cancellationReason } = body

  const valid = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  if (status === 'ORDERED' && !supplierName?.trim())
    return NextResponse.json({ error: 'Supplier name is required to confirm PO' }, { status: 400 })

  if (status === 'IN_TRANSIT' && !TRANSIT_ALLOWED.includes(role))
    return NextResponse.json({ error: 'Only purchasing team can mark as In Transit' }, { status: 403 })

  if (status === 'IN_TRANSIT' && !dispatchPhotoKey)
    return NextResponse.json({ error: 'Dispatch photo is required before marking In Transit' }, { status: 400 })

  if (status === 'CANCELLED') {
    if (!TRANSIT_ALLOWED.includes(role))
      return NextResponse.json({ error: 'Only purchasing team can cancel a PO' }, { status: 403 })
    if (!cancellationReason?.trim())
      return NextResponse.json({ error: 'Cancellation reason is required' }, { status: 400 })
    const existing = await db.purchaseOrder.findUnique({ where: { id }, select: { status: true } })
    if (existing && ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(existing.status))
      return NextResponse.json({ error: 'Cannot cancel a PO that is already in transit or received' }, { status: 400 })
  }

  // Receive permission: based on delivery location's managedBy field
  if (status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED') {
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      select: { deliveryLocation: { select: { managedBy: true } } },
    })
    const managedBy = existing?.deliveryLocation?.managedBy ?? 'WAREHOUSE'
    const receiveAllowed = managedBy === 'PURCHASING'
      ? ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']
      : ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']
    if (!receiveAllowed.includes(role))
      return NextResponse.json({ error: `Only ${managedBy.toLowerCase()} team can receive items for this delivery location` }, { status: 403 })
  }

  const actingUser = (status === 'IN_TRANSIT' || status === 'CANCELLED' || status === 'ORDERED')
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { name: true } })
    : null

  const order = await db.purchaseOrder.update({
    where: { id },
    data: {
      status,
      ...(supplierName !== undefined && { supplierName: supplierName.trim() || null }),
      ...(expectedAt !== undefined && { expectedAt: expectedAt ? new Date(expectedAt) : null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(dispatchPhotoKey !== undefined && { dispatchPhotoKey }),
      ...(status === 'ORDERED' && { orderedAt: new Date(), confirmedByName: actingUser?.name ?? null }),
      ...(status === 'IN_TRANSIT' && { dispatchedAt: new Date(), dispatchedByName: actingUser?.name ?? null }),
      ...(status === 'CANCELLED' && {
        cancelledAt: new Date(),
        cancelledByName: actingUser?.name ?? null,
        cancellationReason: cancellationReason.trim(),
      }),
      updatedAt: new Date(),
    },
  })

  const poNum = order.poNumber
  const supplier = order.supplierName ?? 'supplier'

  if (status === 'ORDERED') {
    notifyByRole(db, ['WAREHOUSE', 'ADMIN'], 'PO_ORDERED',
      `PO Siap Diterima`,
      `${poNum} dari ${supplier} sudah dikonfirmasi — harap siapkan penerimaan barang`,
      id,
    ).catch(console.error)
  } else if (status === 'IN_TRANSIT') {
    notifyByRole(db, ['WAREHOUSE', 'ADMIN'], 'PO_IN_TRANSIT',
      `Barang Dalam Pengiriman`,
      `${poNum} dari ${supplier} sedang dalam perjalanan menuju gudang`,
      id,
    ).catch(console.error)
  } else if (status === 'RECEIVED') {
    notifyByRole(db, ['PURCHASING', 'ADMIN'], 'PO_RECEIVED',
      `Barang Diterima`,
      `${poNum} dari ${supplier} telah diterima lengkap`,
      id,
    ).catch(console.error)
  } else if (status === 'PARTIALLY_RECEIVED') {
    notifyByRole(db, ['PURCHASING', 'ADMIN'], 'PO_PARTIALLY_RECEIVED',
      `Barang Diterima Sebagian`,
      `${poNum} dari ${supplier} diterima sebagian — cek detail penerimaan`,
      id,
    ).catch(console.error)
  }

  return NextResponse.json(order)
}
