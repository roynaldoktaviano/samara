import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadOwnerScope } from '@/lib/lead-access'
import { isLeadLostReason, isLeadStage, LEAD_STAGE_LABEL } from '@/lib/lead-pipeline'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { stage: targetStage, lostReason, lostNote } = body

    if (!isLeadStage(targetStage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }

    // Won leads are archived (deletedAt) once their booking converts them — still movable from the board.
    const lead = await db.lead.findFirst({ where: { id, ...leadOwnerScope((session.user as { role?: string }).role, session.user.id) } })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Manual moves are free (Freshsales-style board) — the automatic ones live in lead-stage-auto.ts.
    if (lead.stage === targetStage) return NextResponse.json({ error: `Already in ${LEAD_STAGE_LABEL[targetStage]}` }, { status: 409 })

    if (targetStage === 'CLOSED_LOST' && !isLeadLostReason(lostReason)) {
      return NextResponse.json({ error: 'Pick a lost reason before marking this lead as Lost.' }, { status: 400 })
    }

    const updated = await db.lead.update({
      where: { id },
      data: {
        stage: targetStage, stageUpdatedAt: new Date(), stageUpdatedById: session.user.id,
        ...(targetStage === 'CLOSED_LOST' ? { lostReason, lostNote: typeof lostNote === 'string' && lostNote.trim() ? lostNote.trim() : null } : {}),
      },
      // The detail view swaps in this response — keep the owner so Sales Owner doesn't blank out
      include: { owner: { select: { id: true, name: true } } },
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
