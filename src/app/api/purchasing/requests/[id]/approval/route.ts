import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyByRoleForRequest, notifyPurchasingForRequest } from '@/lib/notify-purchasing'
import { allItemsCustom } from '@/lib/purchasing/requestItems'

const WAREHOUSE_ROLES = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

// Manager-level approval on a PENDING_APPROVAL PurchaseRequest — distinct from the
// Purchasing team's DRAFT→ON_PROCESS verification in [id]/route.ts. Authorization here
// is identity-based (must be the specific Employee assigned as approverEmployeeId),
// not role-based, since a PR's manager can hold any Role in the system.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Akun kamu belum terhubung ke data karyawan — hubungi Admin/HR.' }, { status: 403 })

  const body = await req.json()
  const { action } = body as { action?: 'approve' | 'reject' }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const request = await db.purchaseRequest.findUnique({
    where: { id },
    select: { id: true, prNumber: true, status: true, approverEmployeeId: true, division: true, items: { select: { itemId: true } } },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'PR ini tidak sedang menunggu approval' }, { status: 409 })
  if (request.approverEmployeeId !== employee.id) return NextResponse.json({ error: 'PR ini bukan untuk kamu approve' }, { status: 403 })

  // Every item is custom (no catalog itemId) — Warehouse has nothing to stock-check, so
  // this skips "Cek Gudang" (DRAFT) and goes straight to Purchasing on approval.
  const allCustom = allItemsCustom(request.items)

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: action === 'approve'
      ? { status: allCustom ? 'ON_PROCESS' : 'DRAFT', approvedById: session.user.id, approvedAt: new Date(), updatedAt: new Date() }
      : { status: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), updatedAt: new Date() },
  })

  if (action === 'approve') {
    if (allCustom) {
      await notifyPurchasingForRequest(
        db, request.division ?? null, 'REQUEST_ORDER_SUBMITTED', 'Request order approved by manager',
        `${request.prNumber} was approved by the requester's manager — all items are custom, no stock check needed.`,
        request.id,
      )
    } else {
      // Warehouse hears about this request now, not Purchasing — they check physical
      // stock first (see the Warehouse stock-check flow); Purchasing only gets notified
      // later, from warehouse-forward/route.ts, for whatever items aren't in stock.
      await notifyByRoleForRequest(
        db, WAREHOUSE_ROLES, 'REQUEST_ORDER_SUBMITTED', 'Request order approved by manager',
        `${request.prNumber} was approved by the requester's manager and is now waiting for a stock check.`,
        request.id,
      )
    }
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')
  return NextResponse.json(updated)
}
