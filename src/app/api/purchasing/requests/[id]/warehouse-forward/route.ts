import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyPurchasingForRequest, notifyRequester } from '@/lib/notify-purchasing'
import { computeStockChecks, type StockCheckRequest } from '@/lib/purchasing/stockCheck'
import { generatePrNumber } from '@/lib/purchasing/docNumber'

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

  const request = await db.purchaseRequest.findUnique({
    where: { id },
    select: {
      id: true, status: true, prNumber: true, division: true, requestedById: true, deliveryLocationId: true,
      transfers: { select: { id: true, status: true, fromLocationId: true, items: { select: { itemId: true } } } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only a request pending Warehouse review can be forwarded' }, { status: 409 })
  }

  const items = await db.purchaseRequestItem.findMany({
    where: { requestId: id },
    select: { id: true, itemId: true, itemName: true, quantity: true, unit: true, convertedAt: true, convertedPoId: true, warehouseDecision: true, verifyRejectedAt: true },
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

  const restocks = await createRestockRequests(db, { ...request, items }, session.user.id)
  const restockNote = restocks.length ? ` Restock gudang: ${restocks.join(', ')}.` : ''

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
    return NextResponse.json({ ...updated, remainingItems: [], restockRequests: restocks })
  }

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: { status: 'ON_PROCESS', verifiedById: session.user.id, verifiedAt: new Date(), updatedAt: new Date() },
  })
  await notifyPurchasingForRequest(
    db, request.division ?? null, 'PR_FORWARDED_FROM_WAREHOUSE',
    'Request Diteruskan dari Gudang',
    `${request.prNumber} — ${remaining.length} item tidak tersedia di gudang, perlu dibelikan.${restockNote}`,
    id,
  )
  await notifyRequester(db, id, {
    type: 'PR_FORWARDED_FROM_WAREHOUSE',
    title: 'Request diteruskan ke Purchasing',
    body: `${request.prNumber} sudah dicek Gudang — ${remaining.length} item perlu dibelikan dan sekarang diproses Purchasing${anyTransferred ? ', sisanya dikirim dari stok gudang' : ''}.`,
    skipUserId: session.user.id,
  })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ...updated, remainingItems: remaining.map(i => i.itemName), restockRequests: restocks })
}

// Lines whose source warehouse would end below Min. Stock (To Be Order > 0) get ordered
// back up to it via a separate "Restock" PR per warehouse — delivered to that warehouse,
// straight to Purchasing (ON_PROCESS, no stock check of its own). Qty is rounded UP to whole
// purchase units when the item buys in a bigger unit (e.g. 1100 ml short → 2 bottles).
async function createRestockRequests(
  db: Awaited<ReturnType<typeof getDb>>,
  request: Omit<StockCheckRequest, 'items'> & { prNumber: string; division: string | null; items: (StockCheckRequest['items'][number] & { itemName: string })[] },
  userId: string,
): Promise<string[]> {
  const { checks } = await computeStockChecks(db, request)
  const lines = request.items
    .map(item => ({ item, check: checks.get(item.id) }))
    .filter((l): l is { item: typeof l.item; check: NonNullable<typeof l.check> } => !!l.check && l.check.restockQty > 0)
  if (!lines.length) return []

  const masters = await db.purchaseItem.findMany({
    where: { id: { in: lines.map(l => l.item.itemId!) } },
    select: { id: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true },
  })
  const masterMap = new Map(masters.map(m => [m.id, m]))
  const byWarehouse = new Map<string, typeof lines>()
  for (const l of lines) byWarehouse.set(l.check.locationId, [...(byWarehouse.get(l.check.locationId) ?? []), l])

  const created: string[] = []
  for (const [locationId, whLines] of byWarehouse) {
    const prNumber = await generatePrNumber(db)
    const now = new Date()
    const restock = await db.purchaseRequest.create({
      data: {
        id: crypto.randomUUID(),
        prNumber,
        requestedById: userId,
        deliveryLocationId: locationId,
        restockForRequestId: request.id,
        division: request.division as never,
        purpose: 'STOCK_INVENTORY',
        notes: `Restock to Min. Stock — triggered by ${request.prNumber}`,
        status: 'ON_PROCESS',
        verifiedById: userId,
        verifiedAt: now,
        updatedAt: now,
        items: {
          create: whLines.map(({ item, check }) => {
            const m = masterMap.get(item.itemId!)
            const conv = m?.conversionFactor || 1
            const inPurchaseUnit = !!m && m.purchaseUnit !== m.baseUnit && conv > 1
            return {
              id: crypto.randomUUID(),
              itemId: item.itemId,
              itemName: m?.name ?? item.itemName,
              quantity: inPurchaseUnit ? Math.ceil(check.restockQty / conv - 1e-9) : Math.ceil(check.restockQty * 100 - 1e-9) / 100,
              unit: inPurchaseUnit ? m!.purchaseUnit : (m?.baseUnit ?? item.unit),
              warehouseDecision: 'PURCHASE',
              warehouseCheckedById: userId,
              warehouseCheckedAt: now,
              notes: `Ending ${check.ending} · Min ${check.minStock} · On order ${check.onOrder} (${m?.baseUnit ?? ''})`,
            }
          }),
        },
      },
      select: { id: true, prNumber: true },
    })
    await notifyPurchasingForRequest(
      db, request.division, 'PR_RESTOCK_CREATED',
      'Restock Gudang',
      `${restock.prNumber} — ${whLines.length} item perlu dibeli supaya stok gudang kembali ke Min. Stock (dari ${request.prNumber}).`,
      restock.id,
    )
    created.push(restock.prNumber)
  }
  return created
}
