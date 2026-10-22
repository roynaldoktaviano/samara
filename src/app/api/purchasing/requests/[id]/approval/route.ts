import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyRequester } from '@/lib/notify-purchasing'
import { initialPrStatus, notifyPrRouted } from '@/lib/purchasing/requestItems'

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
  const { action, reason } = body as { action?: 'approve' | 'reject'; reason?: string }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const request = await db.purchaseRequest.findUnique({
    where: { id },
    select: { id: true, prNumber: true, status: true, approverEmployeeId: true, division: true, items: { select: { viaWarehouse: true } } },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'PR ini tidak sedang menunggu approval' }, { status: 409 })
  if (request.approverEmployeeId !== employee.id) return NextResponse.json({ error: 'PR ini bukan untuk kamu approve' }, { status: 403 })

  // Route was snapshotted per line at submit (routePrLines): only an all-Warehouse PR waits
  // in DRAFT; any direct line goes to Purchasing now, in parallel with Warehouse's check.
  const via = request.items.map(i => i.viaWarehouse)
  const nextStatus = initialPrStatus(via)

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: action === 'approve'
      ? { status: nextStatus, approvedById: session.user.id, approvedAt: new Date(), updatedAt: new Date() }
      : { status: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), updatedAt: new Date() },
  })

  // Let the requester know their manager has decided — otherwise a rejected PR just
  // silently flips status, and an approved one gives no sign it moved on to Gudang.
  // The optional reason only travels in the notification (PurchaseRequest has no
  // rejection-reason column).
  await notifyRequester(db, id, action === 'approve'
    ? {
        type: 'PR_APPROVED',
        title: 'Request disetujui atasan',
        body: `${request.prNumber} sudah disetujui atasan — ${!via.some(Boolean) ? 'diteruskan ke Purchasing' : via.every(Boolean) ? 'sekarang dicek stoknya oleh Gudang' : 'diproses Purchasing & dicek Gudang bersamaan'}.`,
        skipUserId: session.user.id,
      }
    : {
        type: 'PR_REJECTED',
        title: 'Request ditolak atasan',
        body: `${request.prNumber} ditolak oleh atasan.${reason?.trim() ? ` Alasan: ${reason.trim()}` : ''}`,
        skipUserId: session.user.id,
      })

  if (action === 'approve') {
    // Each side hears about its own lines — Warehouse the ones to stock-check, Purchasing
    // the direct ones (warehouse-forward tells Purchasing later about what Warehouse can't cover).
    await notifyPrRouted(db, { id: request.id, prNumber: request.prNumber, division: request.division ?? null }, via, { type: 'REQUEST_ORDER_SUBMITTED' })
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'my-approvals')
  return NextResponse.json(updated)
}
