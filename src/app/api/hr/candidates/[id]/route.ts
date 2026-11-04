import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { CANDIDATE_INCLUDE, CANDIDATE_STATUSES, parseInterviewResult } from '@/lib/candidate-include'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const {
    fullName, appliedRoleId, phone, email, source, resumeFiles, expectedSalary, location, readyJoinDate,
    additionalDocuments, notes, status, assessmentScore, skills, languages, recruitmentRequestId,
    prescreenScheduledAt, prescreenMeetingLink, prescreenNotes,
    hrInterviewScheduledAt, hrInterviewMeetingLink, hrInterviewNotes,
    userInterviewScheduledAt, userInterviewMeetingLink, userInterviewNotes,
  } = body

  if (status !== undefined && !(CANDIDATE_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Invalid candidate status' }, { status: 400 })
  }

  let prescreenResult, hrInterviewResult, userInterviewResult
  try {
    prescreenResult = parseInterviewResult(body.prescreenResult)
    hrInterviewResult = parseInterviewResult(body.hrInterviewResult)
    userInterviewResult = parseInterviewResult(body.userInterviewResult)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const existing = await db.candidate.findUnique({
    where: { id },
    select: { userInterviewScheduledAt: true, userInterviewResult: true, recruitmentRequestId: true, appliedRoleId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Linked to a Recruitment Request → the applied role is pinned to the request's role.
  // Not linked → the role is picked from Roles (the same master the requests use).
  let roleFromRequest: string | undefined
  if (recruitmentRequestId) {
    const request = await db.recruitmentRequest.findUnique({ where: { id: recruitmentRequestId }, select: { roleId: true, status: true } })
    if (!request) return NextResponse.json({ error: 'Recruitment request not found' }, { status: 404 })
    if (recruitmentRequestId !== existing.recruitmentRequestId && request.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Candidates can only be linked to an approved recruitment request' }, { status: 409 })
    }
    // A candidate can only join a request for their own role (an SEO candidate never lands
    // on an Engineer request). No role yet → they take the request's role.
    const candidateRole = appliedRoleId !== undefined ? appliedRoleId || null : existing.appliedRoleId
    if (candidateRole && candidateRole !== request.roleId) {
      return NextResponse.json({ error: 'That recruitment request is for a different role' }, { status: 400 })
    }
    roleFromRequest = request.roleId
  }

  const candidate = await db.candidate.update({
    where: { id },
    data: {
      ...(fullName !== undefined && { fullName: fullName.trim() }),
      ...(roleFromRequest !== undefined
        ? { appliedRoleId: roleFromRequest }
        : appliedRoleId !== undefined && { appliedRoleId: appliedRoleId || null }),
      ...(recruitmentRequestId !== undefined && { recruitmentRequestId: recruitmentRequestId || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(source !== undefined && { source: source?.trim() || null }),
      ...(resumeFiles !== undefined && { resumeFiles: Array.isArray(resumeFiles) ? resumeFiles : [] }),
      ...(expectedSalary !== undefined && { expectedSalary: expectedSalary !== '' && expectedSalary !== null ? Number(expectedSalary) : null }),
      ...(location !== undefined && { location: location?.trim() || null }),
      ...(readyJoinDate !== undefined && { readyJoinDate: readyJoinDate ? new Date(readyJoinDate) : null }),
      ...(additionalDocuments !== undefined && { additionalDocuments: Array.isArray(additionalDocuments) ? additionalDocuments : [] }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(status !== undefined && { status }),
      ...(assessmentScore !== undefined && { assessmentScore: assessmentScore !== '' && assessmentScore !== null ? Number(assessmentScore) : null }),
      ...(skills !== undefined && { skills: Array.isArray(skills) ? skills : [] }),
      ...(languages !== undefined && { languages: Array.isArray(languages) ? languages : [] }),
      ...(prescreenScheduledAt !== undefined && { prescreenScheduledAt: prescreenScheduledAt ? new Date(prescreenScheduledAt) : null }),
      ...(prescreenMeetingLink !== undefined && { prescreenMeetingLink: prescreenMeetingLink?.trim() || null }),
      ...(prescreenResult !== undefined && { prescreenResult }),
      ...(prescreenNotes !== undefined && { prescreenNotes: prescreenNotes?.trim() || null }),
      ...(hrInterviewScheduledAt !== undefined && { hrInterviewScheduledAt: hrInterviewScheduledAt ? new Date(hrInterviewScheduledAt) : null }),
      ...(hrInterviewMeetingLink !== undefined && { hrInterviewMeetingLink: hrInterviewMeetingLink?.trim() || null }),
      ...(hrInterviewResult !== undefined && { hrInterviewResult }),
      ...(hrInterviewNotes !== undefined && { hrInterviewNotes: hrInterviewNotes?.trim() || null }),
      ...(userInterviewScheduledAt !== undefined && { userInterviewScheduledAt: userInterviewScheduledAt ? new Date(userInterviewScheduledAt) : null }),
      ...(userInterviewMeetingLink !== undefined && { userInterviewMeetingLink: userInterviewMeetingLink?.trim() || null }),
      ...(userInterviewNotes !== undefined && { userInterviewNotes: userInterviewNotes?.trim() || null }),
      ...(userInterviewResult !== undefined && {
        userInterviewResult,
        // Only re-stamp who/when when the outcome actually changes.
        ...(userInterviewResult !== existing.userInterviewResult && {
          userInterviewRecordedAt: userInterviewResult ? new Date() : null,
          userInterviewRecordedById: userInterviewResult ? session.user.id : null,
        }),
      }),
    },
    include: CANDIDATE_INCLUDE,
  })

  // Tell the hiring manager when HR (re)schedules a User Interview for their request.
  const newSchedule = candidate.userInterviewScheduledAt?.getTime() ?? null
  const oldSchedule = existing.userInterviewScheduledAt?.getTime() ?? null
  const requesterId = candidate.recruitmentRequest?.requestedBy.id
  if (requesterId && newSchedule && newSchedule !== oldSchedule) {
    const title = 'User interview scheduled'
    const body = `${candidate.fullName} (${candidate.recruitmentRequest!.role.title}) — see Recruitment Request for the time and meeting link, then record your result there.`
    await db.notification.create({ data: { userId: requesterId, type: 'RECRUITMENT_USER_INTERVIEW', title, body } }).catch(() => {})
    sendPushToUsers(db, [requesterId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json(candidate)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.candidate.delete({ where: { id } })
  emitTenantEvent(session.user.tenantId, 'hr-recruitment')
  return NextResponse.json({ ok: true })
}
