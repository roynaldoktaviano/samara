import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantByRequestOrderToken } from '@/lib/resolve-tenant'
import { sendPushToUser } from '@/lib/push'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'

// Public, unauthenticated: internal employees (who may not have an ERP login) submit
// requests here. Each submission becomes a PurchaseRequest routed to the requester's
// manager for approval (PENDING_APPROVAL), falling back to DRAFT straight in
// Purchasing's queue when the org chart can't resolve a usable approver.
// `?token=<per-tenant token>` identifies which company this submission belongs to.

const SYSTEM_REQUESTER_EMAIL = 'system+employee-requests@samara.internal'

async function getSystemRequesterId(db: PrismaClient): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: SYSTEM_REQUESTER_EMAIL }, select: { id: true } })
  if (existing) return existing.id
  const password = await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 12)
  const created = await db.user.create({
    data: { id: crypto.randomUUID(), email: SYSTEM_REQUESTER_EMAIL, name: 'Employee Request Portal', password, role: 'MARKETING' },
    select: { id: true },
  })
  return created.id
}

async function generatePrNumber(db: PrismaClient) {
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

interface RequestItemInput {
  itemId?: string
  itemName: string
  quantity: number
  unit: string
  notes?: string
  imageKeys?: string[]
}

export async function POST(req: NextRequest) {
  const resolved = await resolveTenantByRequestOrderToken(req.nextUrl.searchParams.get('token'))
  if (!resolved) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { db } = resolved

  const body = await req.json()
  const { employeeId, locationId, notes, items, neededByDate, isUrgent, urgentReason, purpose, tripBookingId, division } = body as {
    employeeId?: string; locationId?: string; notes?: string; items?: RequestItemInput[]
    neededByDate?: string; isUrgent?: boolean; urgentReason?: string
    purpose?: 'STOCK_INVENTORY' | 'TRIP'; tripBookingId?: string
    division?: 'BOAT_OPERATION' | 'BUILDING_MATERIAL'
  }

  if (!employeeId) return NextResponse.json({ error: 'Please select who is requesting' }, { status: 400 })
  if (!locationId) return NextResponse.json({ error: 'Please select a delivery location' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Add at least one item to the request' }, { status: 400 })
  }
  for (const it of items) {
    if (!it.itemName?.trim()) return NextResponse.json({ error: 'Every item needs a name or description' }, { status: 400 })
    if (!it.quantity || Number(it.quantity) <= 0) return NextResponse.json({ error: `Quantity for "${it.itemName}" must be greater than 0` }, { status: 400 })
  }
  if (isUrgent && !urgentReason?.trim()) {
    return NextResponse.json({ error: 'Please explain why this request is urgent' }, { status: 400 })
  }
  if (purpose && !['STOCK_INVENTORY', 'TRIP'].includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 })
  }
  if (purpose === 'TRIP' && !tripBookingId) {
    return NextResponse.json({ error: 'Please select which trip this request is for' }, { status: 400 })
  }
  if (!division || !['BOAT_OPERATION', 'BUILDING_MATERIAL'].includes(division)) {
    return NextResponse.json({ error: 'Please select what this request is for' }, { status: 400 })
  }

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true, fullName: true, managerId: true } })
  if (!employee || !employee.isActive) return NextResponse.json({ error: 'Selected requester was not found' }, { status: 400 })

  if (locationId) {
    const loc = await db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true } })
    if (!loc) return NextResponse.json({ error: 'Selected vessel/location was not found' }, { status: 400 })
  }
  if (purpose === 'TRIP' && tripBookingId) {
    const trip = await db.booking.findUnique({ where: { id: tripBookingId }, select: { id: true } })
    if (!trip) return NextResponse.json({ error: 'Selected trip was not found' }, { status: 400 })
  }

  // Route to the requester's manager for approval when the org chart supports it
  // (Employee.managerId set, and that manager has an ERP login to actually see/act on
  // it). Otherwise fall back to the old behaviour — land as DRAFT straight in
  // Purchasing's queue — rather than blocking the employee's submission on missing HR
  // data.
  const manager = employee.managerId
    ? await db.employee.findUnique({ where: { id: employee.managerId }, select: { id: true, userId: true } })
    : null
  const approverEmployeeId = manager?.userId ? manager.id : null

  const [requestedById, prNumber] = await Promise.all([getSystemRequesterId(db), generatePrNumber(db)])

  const request = await db.purchaseRequest.create({
    data: {
      id: crypto.randomUUID(),
      prNumber,
      requestedById,
      requestedByEmployeeId: employeeId,
      approverEmployeeId,
      deliveryLocationId: locationId || null,
      notes: notes?.trim() || null,
      neededByDate: neededByDate ? new Date(neededByDate) : null,
      isUrgent: !!isUrgent,
      urgentReason: isUrgent ? (urgentReason?.trim() || null) : null,
      purpose: purpose === 'TRIP' ? 'TRIP' : 'STOCK_INVENTORY',
      tripBookingId: purpose === 'TRIP' ? (tripBookingId || null) : null,
      division,
      status: approverEmployeeId ? 'PENDING_APPROVAL' : 'DRAFT',
      updatedAt: new Date(),
      items: {
        create: items.map(it => ({
          id: crypto.randomUUID(),
          itemId: it.itemId || null,
          itemName: it.itemName.trim(),
          quantity: Number(it.quantity),
          unit: it.unit?.trim() || 'pcs',
          notes: it.notes?.trim() || null,
          imageKeys: Array.isArray(it.imageKeys) ? it.imageKeys.filter(Boolean) : [],
        })),
      },
    },
    include: { items: true },
  })

  if (approverEmployeeId && manager?.userId) {
    // Route the notification to the assigned manager — Purchasing hears about this
    // request only after it's approved (see approval/route.ts).
    await db.notification.create({
      data: {
        userId: manager.userId,
        type: isUrgent ? 'PR_APPROVAL_URGENT' : 'PR_APPROVAL_NEEDED',
        title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
        body: `${employee.fullName} requested ${request.items.length} item${request.items.length !== 1 ? 's' : ''} — ${prNumber} is waiting for your approval.${isUrgent ? ` URGENT: ${urgentReason?.trim()}` : ''}`,
        requestId: request.id,
      },
    }).catch(() => {})
    await sendPushToUser(db, manager.userId, {
      title: isUrgent ? '🔴 Urgent request needs your approval' : 'Request needs your approval',
      body: `${employee.fullName} — ${prNumber} is waiting for your approval.`,
      url: '/',
    })
  } else {
    // No usable manager on file — fall back to notifying Purchasing directly, same as
    // before, so the request doesn't sit unseen. Flag why it skipped manager approval
    // so Purchasing knows to chase it up manually rather than assume it's a mistake.
    const skipReason = !employee.managerId
      ? ' (no manager on file for this employee — skipped manager approval)'
      : ' (assigned manager has no ERP login yet — skipped manager approval)'
    await notifyPurchasingForRequest(
      db, division,
      isUrgent ? 'REQUEST_ORDER_URGENT' : 'REQUEST_ORDER_SUBMITTED',
      isUrgent ? '🔴 Urgent request order submitted' : 'New request order submitted',
      `${employee.fullName} requested ${request.items.length} item${request.items.length !== 1 ? 's' : ''} — ${prNumber} is waiting for review.${skipReason}${isUrgent ? ` URGENT: ${urgentReason?.trim()}` : ''}`,
      request.id,
    )
  }

  return NextResponse.json(request, { status: 201 })
}
