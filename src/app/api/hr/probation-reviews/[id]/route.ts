import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']
// Management approval is deliberately narrower than the HR review step — Admin/Super
// Admin only, since this app has no dedicated "MANAGEMENT" role to gate on.
const MANAGEMENT_ROLES = ['ADMIN', 'SUPER_ADMIN']

const CHECKLIST_FIELD: Record<string, string> = {
  contract: 'contractProcessedAt',
  pkl: 'pklProcessedAt',
  bpjsTk: 'bpjsTkRegisteredAt',
  bpjsKes: 'bpjsKesRegisteredAt',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json() as {
    action?: 'hr-decide' | 'management-decide' | 'toggle-checklist'
    approved?: boolean; note?: string; checklistItem?: string
  }

  const existing = await db.probationReview.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'hr-decide') {
    if (existing.stage !== 'HR_REVIEW') return NextResponse.json({ error: 'This review is not awaiting HR review' }, { status: 409 })
    const approved = !!body.approved
    const updated = await db.probationReview.update({
      where: { id },
      data: {
        stage: approved ? 'MANAGEMENT_APPROVAL' : 'REJECTED',
        hrDecidedById: session.user.id, hrDecidedAt: new Date(), hrApproved: approved, hrNote: body.note?.trim() || null,
      },
      include: { employee: { select: { fullName: true } } },
    })
    if (approved) {
      const mgmtUsers = await db.user.findMany({ where: { role: { in: MANAGEMENT_ROLES as never[] } }, select: { id: true } })
      if (mgmtUsers.length) {
        const title = 'Probation review needs Management approval'
        const bodyText = `${existing.employee.fullName} — passed HR review, waiting for Management approval.`
        await db.notification.createMany({ data: mgmtUsers.map(u => ({ userId: u.id, type: 'PROBATION_MGMT_APPROVAL_NEEDED', title, body: bodyText })) }).catch(() => {})
        sendPushToUsers(db, mgmtUsers.map(u => u.id), { title, body: bodyText }).catch(() => {})
      }
    }
    return NextResponse.json(updated)
  }

  if (body.action === 'management-decide') {
    if (!roleMatches(role, MANAGEMENT_ROLES)) return NextResponse.json({ error: 'Only Admin/Super Admin can approve at this stage' }, { status: 403 })
    if (existing.stage !== 'MANAGEMENT_APPROVAL') return NextResponse.json({ error: 'This review is not awaiting Management approval' }, { status: 409 })
    const approved = !!body.approved
    const updated = await db.probationReview.update({
      where: { id },
      data: {
        stage: approved ? 'APPROVED' : 'REJECTED',
        managementDecidedById: session.user.id, managementDecidedAt: new Date(), managementApproved: approved, managementNote: body.note?.trim() || null,
      },
      include: { employee: { select: { fullName: true } } },
    })
    return NextResponse.json(updated)
  }

  if (body.action === 'toggle-checklist') {
    if (existing.stage !== 'APPROVED') return NextResponse.json({ error: 'Checklist is only editable once the review is approved' }, { status: 409 })
    const field = body.checklistItem ? CHECKLIST_FIELD[body.checklistItem] : null
    if (!field) return NextResponse.json({ error: 'Invalid checklist item' }, { status: 400 })
    const currentlySet = !!(existing as unknown as Record<string, unknown>)[field]
    const updated = await db.probationReview.update({
      where: { id },
      data: { [field]: currentlySet ? null : new Date() },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
