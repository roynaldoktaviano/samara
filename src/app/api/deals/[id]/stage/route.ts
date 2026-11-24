import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { LEAD_STAGE_LABEL, isLeadStage } from '@/lib/lead-pipeline'
import { chatRole, roleMatches } from '@/lib/role-utils'
import { changeDealStage } from '@/lib/deal-stage'

// Sales Pipeline board: move one deal. Won / Lost are read-only except for ADMIN (parity B4).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = chatRole((session?.user as { role?: string })?.role)
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SALES'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { stage, lostReason, lostNote, paymentStatus, amount, currency } = await req.json()
  const db = await getDb(session)
  const before = await db.deal.findUnique({ where: { id }, select: { stage: true, orderId: true, lead: { select: { name: true } }, customer: { select: { name: true } } } })
  const r = await changeDealStage(db, { dealId: id, stage, lostReason, lostNote, paymentStatus, amount, currency, user: { id: session.user.id, name: session.user.name, role } })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown', userRole: role,
    action: 'UPDATE', entity: 'Deal', entityId: id,
    detail: `Deal ${before?.orderId ?? id} (${before?.lead?.name ?? before?.customer?.name ?? '—'}): ${before ? LEAD_STAGE_LABEL[before.stage] : '?'} → ${isLeadStage(stage) ? LEAD_STAGE_LABEL[stage] : stage}`,
  }, db).catch(() => {})
  emitTenantEvent(session.user.tenantId, 'chat')
  return NextResponse.json({ ok: true })
}
