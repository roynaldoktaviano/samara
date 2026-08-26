import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'

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
    select: { id: true, prNumber: true, status: true, approverEmployeeId: true, division: true },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'PR ini tidak sedang menunggu approval' }, { status: 409 })
  if (request.approverEmployeeId !== employee.id) return NextResponse.json({ error: 'PR ini bukan untuk kamu approve' }, { status: 403 })

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: action === 'approve'
      ? { status: 'DRAFT', approvedById: session.user.id, approvedAt: new Date(), updatedAt: new Date() }
      : { status: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), updatedAt: new Date() },
  })

  await notifyPurchasingForRequest(
    db, request.division,
    action === 'approve' ? 'REQUEST_ORDER_SUBMITTED' : 'REQUEST_ORDER_REJECTED',
    action === 'approve' ? 'Request order approved by manager' : 'Request order rejected by manager',
    action === 'approve'
      ? `${request.prNumber} was approved by the requester's manager and is now waiting for Purchasing review.`
      : `${request.prNumber} was rejected by the requester's manager.`,
    request.id,
  )

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')
  return NextResponse.json(updated)
}
