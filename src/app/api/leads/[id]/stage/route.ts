import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { canTransition, getMissingQualificationFields, isLeadLostReason, isLeadStage, LEAD_STAGE_LABEL, LEAD_TRANSITIONS } from '@/lib/lead-pipeline'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { stage: targetStage, lostReason, lostNote, proposalSentAt } = body

    if (!isLeadStage(targetStage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({ where: { id } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canTransition(lead.stage, targetStage)) {
      const validNext = LEAD_TRANSITIONS[lead.stage].map(s => LEAD_STAGE_LABEL[s])
      return NextResponse.json({
        error: validNext.length > 0
          ? `Cannot move from ${LEAD_STAGE_LABEL[lead.stage]} to ${LEAD_STAGE_LABEL[targetStage]}. Valid next stage(s): ${validNext.join(', ')}`
          : `${LEAD_STAGE_LABEL[lead.stage]} is a final stage and cannot be changed.`,
      }, { status: 409 })
    }

    if (targetStage === 'QUALIFIED') {
      const missingFields = getMissingQualificationFields(lead)
      if (missingFields.length > 0) {
        return NextResponse.json({
          error: 'Complete the required qualification fields before marking this lead as Qualified.',
          missingFields,
        }, { status: 400 })
      }
    }

    if (targetStage === 'CLOSED_LOST' && !isLeadLostReason(lostReason)) {
      return NextResponse.json({ error: 'Pick a lost reason before marking this lead as Closed Lost.' }, { status: 400 })
    }

    const updated = await db.lead.update({
      where: { id },
      data: {
        stage: targetStage, stageUpdatedAt: new Date(), stageUpdatedById: session.user.id,
        ...(targetStage === 'OPPORTUNITY' && !lead.proposalSentAt
          ? { proposalSentAt: proposalSentAt ? new Date(proposalSentAt) : new Date() }
          : {}),
        ...(targetStage === 'CLOSED_LOST' ? { lostReason, lostNote: typeof lostNote === 'string' && lostNote.trim() ? lostNote.trim() : null } : {}),
      },
    })

    logActivity({
      userId:   session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: (session.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Lead', entityId: id,
      detail: `Lead stage: ${LEAD_STAGE_LABEL[lead.stage]} → ${LEAD_STAGE_LABEL[targetStage]} (${lead.name})`,
    }, db).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating lead stage:', error)
    return NextResponse.json({ error: 'Failed to update lead stage' }, { status: 500 })
  }
}
