import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Links several candidates to one approved Recruitment Request at once (Candidates page,
// checkbox selection). Same rule as the single-candidate form: every candidate must
// already have the request's role, or no role yet (they then take the request's role).
// All-or-nothing — if any candidate doesn't fit, nothing is linked.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json() as { candidateIds?: unknown; recruitmentRequestId?: unknown }
  const candidateIds = Array.isArray(body.candidateIds) ? [...new Set(body.candidateIds.filter((v): v is string => typeof v === 'string'))] : []
  const recruitmentRequestId = typeof body.recruitmentRequestId === 'string' ? body.recruitmentRequestId : ''
  if (candidateIds.length === 0) return NextResponse.json({ error: 'Select at least one candidate' }, { status: 400 })
  if (!recruitmentRequestId) return NextResponse.json({ error: 'Please select a recruitment request' }, { status: 400 })

  const request = await db.recruitmentRequest.findUnique({
    where: { id: recruitmentRequestId },
    select: { roleId: true, status: true, role: { select: { title: true } } },
  })
  if (!request) return NextResponse.json({ error: 'Recruitment request not found' }, { status: 404 })
  if (request.status !== 'APPROVED') return NextResponse.json({ error: 'Candidates can only be linked to an approved recruitment request' }, { status: 409 })

  const candidates = await db.candidate.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, fullName: true, appliedRoleId: true },
  })
  if (candidates.length !== candidateIds.length) return NextResponse.json({ error: 'Some candidates no longer exist — refresh and try again' }, { status: 404 })

  const mismatched = candidates.filter(c => c.appliedRoleId && c.appliedRoleId !== request.roleId)
  if (mismatched.length) {
    const names = mismatched.slice(0, 3).map(c => c.fullName).join(', ') + (mismatched.length > 3 ? ` and ${mismatched.length - 3} more` : '')
    return NextResponse.json({ error: `${names} ${mismatched.length === 1 ? 'is' : 'are'} not applying for ${request.role.title}` }, { status: 400 })
  }

  const { count } = await db.candidate.updateMany({
    where: { id: { in: candidateIds } },
    data: { recruitmentRequestId, appliedRoleId: request.roleId },
  })

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json({ linked: count })
}
