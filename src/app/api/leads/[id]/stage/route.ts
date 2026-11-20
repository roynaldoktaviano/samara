import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadOwnerScope } from '@/lib/lead-access'
import { isLeadStage, LEAD_STAGE_LABEL } from '@/lib/lead-pipeline'
import { chatRole } from '@/lib/role-utils'
import { changeDealStage, primaryDealOfLead } from '@/lib/deal-stage'
import { runDealMakerLocked } from '@/lib/deal-maker'

// Stage of a lead = stage of its PRIMARY deal (newest open, else newest) — the stage picker in the
// chat lead panel and on the Leads page. Won / Lost deals are read-only except for ADMIN
// (src/lib/deal-stage.ts). A lead with no deal yet gets one (manual entry) at the chosen stage.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const role = chatRole((session.user as { role?: string }).role)
  try {
    const { id } = await params
    const { stage, lostReason, lostNote, paymentStatus } = await request.json()
    if (!isLeadStage(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })

    const lead = await db.lead.findFirst({ where: { id, ...leadOwnerScope(role, session.user.id) }, select: { id: true, name: true, stage: true, tripType: true } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let deal = await primaryDealOfLead(db, id)
    if (!deal) {
      const made = await runDealMakerLocked(db, { leadId: id, brand: 'SAMARA', tripType: lead.tripType, channel: 'MANUAL', enquiry: false, actingUserId: session.user.id })
      deal = { id: made.dealId, stage: 'NEW' }
    }
    const from = deal.stage
    const r = await changeDealStage(db, { dealId: deal.id, stage, lostReason, lostNote, paymentStatus, user: { id: session.user.id, name: session.user.name, role } })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

    logActivity({
      userId:   session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: role,
      action: 'UPDATE', entity: 'Lead', entityId: id,
      detail: `Deal stage: ${LEAD_STAGE_LABEL[from]} → ${LEAD_STAGE_LABEL[stage]} (${lead.name})`,
    }, db).catch(() => {})

    const updated = await db.lead.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true } } } })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating lead stage:', error)
    return NextResponse.json({ error: 'Failed to update lead stage' }, { status: 500 })
  }
}
