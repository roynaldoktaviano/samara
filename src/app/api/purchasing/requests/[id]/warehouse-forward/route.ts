import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { notifyPurchasingForRequest } from '@/lib/notify-purchasing'
import { finishWarehouseCheck, freeStock, loadWarehouseRequest, processWarehouseLine, undecidedLines } from '@/lib/purchasing/warehouseProcess'

// Warehouse's "Process Purchase Request": once every Warehouse-routed line is Approved (see
// .../items/[itemId]/warehouse-check), decide them all at once — Reserve > 0 → TR + backorder,
// Reserve 0 → to Purchasing — then finish the check (To Be Order → Restock PRs, PR to
// ON_PROCESS, or CONVERTED when nothing is left for Purchasing). Stock is re-checked for every
// line first, so a shortfall stops the whole run before anything moves.
const ALLOWED = ['WAREHOUSE', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const request = await loadWarehouseRequest(db, id)
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  // DRAFT = all lines are Warehouse's. ON_PROCESS with warehouseDoneAt unset = a parallel PR:
  // Purchasing is already on its direct lines while Warehouse finishes its own share.
  const parallel = request.status === 'ON_PROCESS' && !request.warehouseDoneAt
  if (request.status !== 'DRAFT' && !parallel) {
    return NextResponse.json({ error: 'Only a request pending Warehouse review can be processed' }, { status: 409 })
  }
  const undecided = undecidedLines(request)
  const unapproved = undecided.filter(i => !i.warehouseApprovedAt || !i.warehouseFromLocationId || i.warehouseReserveQty == null)
  if (unapproved.length > 0) {
    return NextResponse.json({ error: `Approve every item first: ${unapproved.map(i => i.itemName).join(', ')}` }, { status: 409 })
  }
  if (!parallel && request.items.every(i => i.verifyRejectedAt)) {
    return NextResponse.json({ error: 'All items were rejected — reject this PR instead of processing it' }, { status: 409 })
  }
  if (undecided.some(i => (i.warehouseReserveQty ?? 0) > 0) && !request.deliveryLocationId) {
    return NextResponse.json({ error: 'PR has no delivery location — cannot transfer from stock' }, { status: 409 })
  }

  // Stock may have moved since each line was approved — check all of it before touching anything
  // (two lines of the same item from the same warehouse count together).
  const need = new Map<string, number>()
  for (const l of undecided) {
    if ((l.warehouseReserveQty ?? 0) <= 0) continue
    const key = `${l.itemId}:${l.warehouseFromLocationId}`
    need.set(key, (need.get(key) ?? 0) + l.warehouseReserveQty!)
  }
  const free = await freeStock(db, [...need.keys()].map(k => { const [itemId, locationId] = k.split(':'); return { itemId, locationId } }))
  const short = undecided.filter(l => (l.warehouseReserveQty ?? 0) > 0 && need.get(`${l.itemId}:${l.warehouseFromLocationId}`)! > (free.get(`${l.itemId}:${l.warehouseFromLocationId}`) ?? 0) + 1e-6)
  if (short.length > 0) {
    return NextResponse.json({ error: `Stock changed since approval — re-approve with a lower reserve: ${[...new Set(short.map(l => l.itemName))].join(', ')}` }, { status: 409 })
  }

  const transfers = new Set<string>()
  const purchased: string[] = []
  for (const line of undecided) {
    const result = await processWarehouseLine(db, request, line, session.user.id)
    if (!result || 'overFree' in result) continue
    if (result.transferNumber) transfers.add(result.transferNumber)
    if (result.outcome === 'PURCHASE') purchased.push(line.itemName)
  }

  const result = await finishWarehouseCheck(db, id, session.user.id)
  if (!result) return NextResponse.json({ error: 'Warehouse check was already finished' }, { status: 409 })
  if (purchased.length > 0) {
    await notifyPurchasingForRequest(
      db, request.division ?? null, 'PR_FORWARDED_FROM_WAREHOUSE', 'Items to purchase from Warehouse check',
      `${request.prNumber} — not taken from warehouse stock, to be purchased directly for the vessel: ${purchased.join(', ')}.`,
      id,
    )
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  if (transfers.size) emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  return NextResponse.json({
    ...result.updated,
    remainingItems: result.remaining,
    restockRequests: result.restocks,
    transferNumbers: [...transfers],
    purchasedItems: purchased,
  })
}
