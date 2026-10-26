import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { finishWarehouseCheck, loadWarehouseRequest, undecidedLines } from '@/lib/purchasing/warehouseProcess'

// Warehouse's "done checking" action. Normally not needed any more — processing the last
// Warehouse-routed line finishes the check by itself (see .../items/[itemId]/warehouse-check);
// this stays as the manual fallback (e.g. the last open line got rejected instead of processed).
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
    return NextResponse.json({ error: 'Only a request pending Warehouse review can be forwarded' }, { status: 409 })
  }
  const undecided = undecidedLines(request)
  if (undecided.length > 0) {
    return NextResponse.json({ error: `Some items have not been checked yet: ${undecided.map(i => i.itemName).join(', ')}` }, { status: 409 })
  }
  if (!parallel && request.items.every(i => i.verifyRejectedAt)) {
    return NextResponse.json({ error: 'All items were rejected — reject this PR instead of forwarding it' }, { status: 409 })
  }

  const result = await finishWarehouseCheck(db, id, session.user.id)
  if (!result) return NextResponse.json({ error: 'Warehouse check was already finished' }, { status: 409 })
  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  return NextResponse.json({ ...result.updated, remainingItems: result.remaining, restockRequests: result.restocks })
}
