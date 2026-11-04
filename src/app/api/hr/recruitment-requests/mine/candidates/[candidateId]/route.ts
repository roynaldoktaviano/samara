import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { parseInterviewResult } from '@/lib/candidate-include'
import { REQUESTER_VISIBLE_CANDIDATE } from '@/lib/hr/recruitment'

const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']
const RESULT_LABEL = { PASSED: 'Passed', ON_HOLD: 'On Hold', FAILED: 'Failed' } as const

// The requester records the User Interview outcome for a candidate on their own request.
// HR still owns moving the candidate on (Offer / Rejected) — this only records the result.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json() as { userInterviewResult?: string; userInterviewNotes?: string }

  let result
  try { result = parseInterviewResult(body.userInterviewResult) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  if (!result) return NextResponse.json({ error: 'Please pick a result' }, { status: 400 })

  const candidate = await db.candidate.findFirst({
    where: { id: candidateId, recruitmentRequest: { requestedById: session.user.id }, ...REQUESTER_VISIBLE_CANDIDATE },
    select: { id: true, fullName: true, recruitmentRequest: { select: { role: { select: { title: true } } } } },
  })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  await db.candidate.update({
    where: { id: candidateId },
    data: {
      userInterviewResult: result,
      userInterviewNotes: body.userInterviewNotes?.trim() || null,
      userInterviewRecordedAt: new Date(),
      userInterviewRecordedById: session.user.id,
    },
  })

  const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    const title = 'User interview result recorded'
    const notifBody = `${candidate.fullName} (${candidate.recruitmentRequest?.role.title ?? '—'}): ${RESULT_LABEL[result]}.`
    await db.notification.createMany({ data: hrUsers.map(u => ({ userId: u.id, type: 'RECRUITMENT_USER_INTERVIEW_RESULT', title, body: notifBody })) }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body: notifBody }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json({ ok: true })
}
