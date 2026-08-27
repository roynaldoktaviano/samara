import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { getOrCreatePoReceiveToken, resolveBaseUrl } from '@/lib/purchasing/receiveLink'
import { resolveAssignedYachtId, yachtCanViewOrder } from '@/lib/purchasing/yachtScope'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

// Generates (or reuses) a no-login link crew on a yacht can open to confirm receiving this
// PO's goods — see src/app/po-receive/[token]/page.tsx. Mirrors
// src/app/api/purchasing/transfers/[id]/receive-link/route.ts exactly. Boat Captain/Cruise
// Director can pull this themselves too (on top of the auto-push already sent when the PO
// went IN_TRANSIT — see notifyAssignedYachtCaptains in orders/[id]/route.ts) — useful if
// they missed the push or want to re-share the link — but only for their own yacht's PO.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const order = await db.purchaseOrder.findUnique({ where: { id }, select: { status: true, deliveryLocation: { select: { yachtId: true } } } })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (roleMatches(role, ['BOAT_CAPTAIN', 'CRUISE_DIRECTOR'])) {
    const yachtId = await resolveAssignedYachtId(db, session.user.id)
    if (!yachtCanViewOrder(order, yachtId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(order.status))
    return NextResponse.json({ error: 'PO harus berstatus In Transit dulu' }, { status: 400 })

  const { token, expiresAt } = await getOrCreatePoReceiveToken(db, id)
  const link = `${resolveBaseUrl(req)}/po-receive/${token}`

  return NextResponse.json({ link, expiresAt })
}
