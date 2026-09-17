import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'

// Warehouse's "done checking" action: closes out the PR straight to CONVERTED if every
// item was resolved from stock, or forwards the remaining items on to Purchasing
// (status ON_PROCESS) otherwise. See PATCH .../items/[itemId]/warehouse-check for the
// per-item decision this depends on.
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await db.purchaseRequest.findUnique({ where: { id }, select: { status: true, prNumber: true, division: true, requestedById: true } })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only a request pending Warehouse review can be forwarded' }, { status: 409 })
  }

  const items = await db.purchaseRequestItem.findMany({
    where: { requestId: id },
    select: { id: true, itemId: true, itemName: true, convertedAt: true, warehouseDecision: true, verifyRejectedAt: true },
  })

  // Every catalog item needs an explicit decision first — custom/non-catalog items (no
  // itemId) can't be stock-checked, so they always fall through to Purchasing on their
  // own, and an item Purchasing already rejected at triage is permanently settled too
  // (same exclusion the convert step itself uses).
  const undecided = items.filter(i => i.itemId && !i.convertedAt && !i.verifyRejectedAt && !i.warehouseDecision)
  if (undecided.length > 0) {
    return NextResponse.json({
      error: `Masih ada item yang belum dicek: ${undecided.map(i => i.itemName).join(', ')}`,
    }, { status: 409 })
  }

  const remaining = items.filter(i => !i.convertedAt && !i.verifyRejectedAt)
  const anyTransferred = items.some(i => i.convertedAt)

  if (remaining.length === 0 && !anyTransferred) {
    return NextResponse.json({ error: 'Semua item ditolak — reject PR ini langsung, bukan diteruskan' }, { status: 409 })
  }

  if (remaining.length === 0) {
    const updated = await db.purchaseRequest.update({
      where: { id },
      data: { status: 'CONVERTED', convertedById: session.user.id, convertedAt: new Date(), updatedAt: new Date() },
    })
    await db.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: request.requestedById,
        type: 'PR_FULFILLED_FROM_STOCK',
        title: 'Request Selesai dari Stok Gudang',
        body: `${request.prNumber} sudah dipenuhi seluruhnya dari stok gudang — tidak perlu pembelian.`,
        requestId: id,
      },
    })
    emitTenantEvent(session.user.tenantId, 'purchasing-requests')
    return NextResponse.json({ ...updated, remainingItems: [] })
  }

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: { status: 'ON_PROCESS', verifiedById: session.user.id, verifiedAt: new Date(), updatedAt: new Date() },
  })
  await notifyPurchasingForRequest(
    db, request.division ?? null, 'PR_FORWARDED_FROM_WAREHOUSE',
    'Request Diteruskan dari Gudang',
    `${request.prNumber} — ${remaining.length} item tidak tersedia di gudang, perlu dibelikan.`,
    id,
  )
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ...updated, remainingItems: remaining.map(i => i.itemName) })
}
