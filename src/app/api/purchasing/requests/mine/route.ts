import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { createPurchaseRequest } from '@/lib/purchasing/createRequest'

// Self-service "Purchase Request" menu — every employee can ask Purchasing to buy something
// for their own work. The request goes to their manager first (Employee.managerId, approved
// in My Approvals via [id]/approval), then on to Purchasing — same PurchaseRequest rows and
// routing as Purchasing › Requests (see createPurchaseRequest), only free-text (custom)
// lines and a required "what is it for" reason, stored as the PR's notes.

const roleOf = (session: { user?: unknown } | null) => (session?.user as { role?: string } | undefined)?.role ?? ''

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = roleOf(session)
  if (!session?.user?.id || role === 'BOT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true, managerId: true } })
  const manager = employee?.managerId
    ? await db.employee.findUnique({ where: { id: employee.managerId }, select: { fullName: true, userId: true } })
    : null

  const [locations, requests] = await Promise.all([
    db.stockLocation.findMany({
      where: { isActive: true, type: { in: ['WAREHOUSE', 'VESSEL', 'SITE'] } },
      select: { id: true, name: true, type: true, parentId: true },
      orderBy: { name: 'asc' },
    }),
    db.purchaseRequest.findMany({
      where: { OR: [{ requestedById: session.user.id }, ...(employee ? [{ requestedByEmployeeId: employee.id }] : [])] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, prNumber: true, status: true, notes: true, createdAt: true, neededByDate: true,
        isUrgent: true, urgentReason: true, approvedAt: true, rejectedAt: true, cancelledAt: true,
        deliveryLocation: { select: { name: true } },
        approverEmployee: { select: { fullName: true } },
        approvedBy: { select: { name: true } },
        rejectedBy: { select: { name: true } },
        items: { select: { id: true, itemName: true, quantity: true, unit: true, estimatedCost: true, notes: true }, orderBy: { id: 'asc' } },
        orders: { select: { poNumber: true, status: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
  ])

  return NextResponse.json({
    linked: !!employee,
    // Who signs off on a new request — null means it goes straight to Purchasing
    // (no manager on file, or the manager has no ERP login to approve with).
    approverName: manager?.userId ? manager.fullName : null,
    locations,
    requests,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = roleOf(session)
  if (!session?.user?.id || role === 'BOT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  // The manager approval hangs off the requester's Employee record — without one there's
  // nobody to route it to, so it would skip approval entirely.
  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Your account is not linked to an employee record — contact Admin/HR.' }, { status: 403 })

  const body = await req.json() as {
    reason?: string; deliveryLocationId?: string; neededByDate?: string; isUrgent?: boolean; urgentReason?: string
    items?: { itemName?: string; quantity?: number; unit?: string; estimatedCost?: number; notes?: string }[]
  }
  if (!body.reason?.trim()) return NextResponse.json({ error: 'Please explain what this purchase is for' }, { status: 400 })

  const result = await createPurchaseRequest(db, session, role, {
    deliveryLocationId: body.deliveryLocationId,
    notes: body.reason,
    neededByDate: body.neededByDate || undefined,
    isUrgent: !!body.isUrgent,
    urgentReason: body.urgentReason,
    purpose: 'STOCK_INVENTORY',
    // Custom lines only: these are things to buy, not catalog stock to pull from a warehouse,
    // so they always go straight to Purchasing once approved (see routePrLines).
    items: Array.isArray(body.items)
      ? body.items.map(it => ({
          itemName: it.itemName?.trim() ?? '',
          quantity: Number(it.quantity),
          unit: it.unit?.trim() || 'pcs',
          estimatedCost: Number(it.estimatedCost) || 0,
          notes: it.notes,
        }))
      : undefined,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')
  return NextResponse.json({ id: result.request.id, prNumber: result.request.prNumber, status: result.request.status }, { status: 201 })
}
