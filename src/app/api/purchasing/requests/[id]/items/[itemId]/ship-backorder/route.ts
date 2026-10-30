import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { allocateBackorders } from '@/lib/purchasing/backorders'

// "Ship from stock now" on a backordered PR line. A backorder normally ships by itself when
// restock arrives at its warehouse (allocateBackorders on a PO receipt / incoming TR); stock
// that frees up any other way (a cancelled TR, an opname) never triggers that, so the line
// would sit waiting. This runs the same allocation by hand: free stock there goes to the
// backorders waiting for that item, oldest PR first, each onto a PENDING TR for Warehouse to
// dispatch.
const ALLOWED = ['WAREHOUSE', 'PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const line = await db.purchaseRequestItem.findUnique({
    where: { id: itemId },
    select: { requestId: true, itemId: true, backorderQty: true, backorderLocationId: true },
  })
  if (!line || line.requestId !== id) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!line.itemId || !line.backorderLocationId || line.backorderQty <= 0) {
    return NextResponse.json({ error: 'Nothing is backordered on this item' }, { status: 409 })
  }

  const transferNumbers = await allocateBackorders(db, line.backorderLocationId, [line.itemId])
  const after = await db.purchaseRequestItem.findUnique({ where: { id: itemId }, select: { backorderQty: true } })
  const shipped = line.backorderQty - (after?.backorderQty ?? 0)
  if (shipped <= 1e-9) {
    return NextResponse.json({ error: 'No free stock left for this item — older requests were served first' }, { status: 409 })
  }

  emitTenantEvent(session.user.tenantId, 'purchasing-requests')
  emitTenantEvent(session.user.tenantId, 'purchasing-transfers')
  return NextResponse.json({ ok: true, shipped, remaining: after?.backorderQty ?? 0, transferNumbers })
}
