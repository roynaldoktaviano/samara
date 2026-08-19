import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { computePOGrandTotal, summarizePOPayments } from '@/lib/po-payment'
import { computeCurrentLegLabel } from '@/lib/purchasing/transitChain'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']
const CREATE_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

async function generatePoNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`
  const last = await db.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } })
  const seq = last ? (parseInt(last.poNumber.split('-').pop() ?? '0') || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const orders = await db.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { id: true, itemName: true, unit: true, orderedQty: true, receivedQty: true, unitCost: true } },
      deliveryLocation: { select: { id: true, name: true, type: true, managedBy: true, yachtId: true } },
      booking: { select: { bookingCode: true, tripType: true, customer: { select: { name: true } }, yacht: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      request: {
        select: {
          requestedBy: { select: { name: true } },
          requestedByEmployee: { select: { fullName: true, employeeNumber: true, department: true, location: { select: { name: true } } } },
        },
      },
      receipts: {
        orderBy: { receivedAt: 'desc' },
        take: 1,
        select: { receivedAt: true, receivedBy: { select: { name: true } } },
      },
      paymentRequests: { select: { amount: true, status: true } },
      reimbursements: { select: { amount: true, status: true } },
      transitStops: { orderBy: { sequence: 'asc' }, select: { locationId: true, sequence: true, location: { select: { id: true, name: true, type: true } } } },
      transitTransfers: {
        where: { status: { in: ['PENDING', 'DISPATCHED'] } },
        orderBy: { legSequence: 'desc' },
        take: 1,
        select: { status: true, legSequence: true, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
      },
    },
  })
  const results = orders.map(o => {
    const totalOrdered = o.items.reduce((s, i) => s + i.orderedQty, 0)
    const totalReceived = o.items.reduce((s, i) => s + i.receivedQty, 0)
    const fullyReceivedCount = o.items.filter(i => i.receivedQty >= i.orderedQty).length
    // A PO can be paid across multiple installments (DP + final settlement),
    // in any mix of Request Payment/Debit Paid (paymentRequests) and
    // Reimburse (reimbursements) — status reflects what's actually PAID
    // against the order's real total, not just "any record exists".
    const grandTotal = computePOGrandTotal(o)
    const { paymentStatus } = summarizePOPayments(grandTotal, o.paymentRequests, o.reimbursements)
    const currentLegLabel = computeCurrentLegLabel(o)
    return {
      ...o,
      itemCount: o.items.length,
      totalOrdered,
      totalReceived,
      fullyReceivedCount,
      items: o.items,
      lastReceivedAt: o.receipts[0]?.receivedAt ?? null,
      lastReceivedBy: o.receipts[0]?.receivedBy?.name ?? null,
      receipts: undefined,
      paymentStatus,
      paymentRequests: undefined,
      reimbursements: undefined,
      createdByName: o.createdBy?.name ?? null,
      requestedByName: o.requestedByName ?? o.request?.requestedByEmployee?.fullName ?? null,
      requestedByOffice: o.requestedByOffice ?? o.request?.requestedByEmployee?.location?.name ?? null,
      requestedByDepartment: o.requestedByDepartment ?? o.request?.requestedByEmployee?.department ?? null,
      requestedByRole: o.requestedByRole ?? null,
      booking: o.booking ? { bookingCode: o.booking.bookingCode, tripType: o.booking.tripType, leadGuestName: o.booking.customer.name, yacht: o.booking.yacht } : null,
      request: undefined,
      createdBy: undefined,
      transitStops: o.transitStops.map(s => ({ locationId: s.locationId, sequence: s.sequence, location: s.location })),
      transitTransfers: undefined,
      currentLegLabel,
    }
  })
  // A fresh payment request/reimbursement (e.g. a "pelunasan") should surface at the top
  // regardless of the order's original createdAt — that's the actionable item Finance/
  // Purchasing needs to see first. Stable sort keeps everything else in its existing
  // createdAt-desc order within each of the two groups.
  results.sort((a, b) => (a.paymentStatus === 'PENDING' ? 0 : 1) - (b.paymentStatus === 'PENDING' ? 0 : 1))
  return NextResponse.json(results)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, CREATE_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { supplierId, supplierName, deliveryLocationId, expectedAt, notes, items, requestedByEmployeeId, extraCharges, discountType, discountValue, bookingId, transitStops } = body
  if (!supplierName) return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
  if (!requestedByEmployeeId) return NextResponse.json({ error: 'Requested by wajib diisi' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Minimal 1 item dibutuhkan' }, { status: 400 })

  // Ordered list of intermediate transit stops between the supplier and deliveryLocationId
  // (the final destination) — see src/lib/purchasing/transitChain.ts for how each hop is
  // executed as an auto-chained StockTransfer.
  const cleanTransitStopIds = [...new Set(
    Array.isArray(transitStops) ? transitStops.filter((x: unknown): x is string => typeof x === 'string' && !!x) : []
  )]
  if (deliveryLocationId && cleanTransitStopIds.includes(deliveryLocationId))
    return NextResponse.json({ error: 'Transit stop tidak boleh sama dengan Delivery Location' }, { status: 400 })
  if (cleanTransitStopIds.length > 0) {
    const validCount = await db.stockLocation.count({ where: { id: { in: cleanTransitStopIds } } })
    if (validCount !== cleanTransitStopIds.length) return NextResponse.json({ error: 'Salah satu transit stop tidak valid' }, { status: 400 })
  }

  // Resolve supplierId by name if not provided, so order history stays linked even for raw API callers
  const cleanExtraCharges = Array.isArray(extraCharges)
    ? extraCharges
        .map((c: { label?: string; amount?: number }) => ({ label: String(c.label ?? '').trim(), amount: Number(c.amount) || 0 }))
        .filter(c => c.label || c.amount)
    : []

  const cleanDiscountType = discountType === 'PERCENT' || discountType === 'FIXED' ? discountType : null
  const cleanDiscountValue = cleanDiscountType ? Math.max(0, Number(discountValue) || 0) : 0

  let resolvedSupplierId = supplierId || null
  if (!resolvedSupplierId) {
    const matched = await db.supplier.findFirst({ where: { name: { equals: supplierName.trim(), mode: 'insensitive' } }, select: { id: true } })
    resolvedSupplierId = matched?.id ?? null
  }

  // Snapshot requester's department/office/role at creation time — stays accurate even if the
  // employee's record changes later.
  let requester: { fullName: string; department: string | null; location: { name: string } | null; role: { title: string } | null } | null = null
  if (requestedByEmployeeId) {
    requester = await db.employee.findUnique({
      where: { id: requestedByEmployeeId },
      select: { fullName: true, department: true, location: { select: { name: true } }, role: { select: { title: true } } },
    })
  }

  const [poNumber, actingUser] = await Promise.all([
    generatePoNumber(db),
    db.user.findUnique({ where: { id: session.user.id }, select: { name: true } }),
  ])
  const order = await db.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber,
      supplierId: resolvedSupplierId,
      supplierName: supplierName.trim(),
      deliveryLocationId: deliveryLocationId || null,
      bookingId: bookingId || null,
      status: 'ORDERED',
      confirmedByName: actingUser?.name ?? null,
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      notes: notes?.trim() || null,
      createdById: session.user.id,
      updatedAt: new Date(),
      extraCharges: cleanExtraCharges.length > 0 ? cleanExtraCharges : undefined,
      discountType: cleanDiscountType,
      discountValue: cleanDiscountValue,
      ...(requester && {
        requestedByEmployeeId,
        requestedByName: requester.fullName,
        requestedByOffice: requester.location?.name ?? null,
        requestedByDepartment: requester.department ?? null,
        requestedByRole: requester.role?.title ?? null,
      }),
      items: {
        create: items.map((it: { itemId?: string; itemName: string; orderedQty: number; unitCost?: number; unit?: string }) => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName,
          unit: it.itemId ? null : (it.unit?.trim() || null),
          orderedQty: Number(it.orderedQty),
          unitCost: Number(it.unitCost) || 0,
        })),
      },
      ...(cleanTransitStopIds.length > 0 && {
        transitStops: {
          create: cleanTransitStopIds.map((locationId, idx) => ({ id: crypto.randomUUID(), sequence: idx + 1, locationId })),
        },
      }),
    },
    include: { items: true, transitStops: true },
  })
  return NextResponse.json(order, { status: 201 })
}
