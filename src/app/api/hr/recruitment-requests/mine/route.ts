import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

import { emitTenantEvent } from '@/lib/realtime-bus'
import {
  RECRUITMENT_PRIORITIES, RECRUITMENT_REASONS, RECRUITMENT_REQUEST_INCLUDE, REQUESTER_VISIBLE_CANDIDATE,
  canRaiseRecruitmentRequest, getRecruitmentApproverIds, notifyRecruitmentApprovers, notifyRecruitmentReachedHr,
} from '@/lib/hr/recruitment'

// Self-service side for supervisors/heads — identity-based like performance-reviews/mine:
// anyone whose Employee record has direct reports (Employee.managerId → them) can raise a
// request, whatever their login Role. ?summary=1 is the cheap sidebar probe (menu
// visibility + badge for User Interviews still waiting on this requester's result).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const me = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, department: true, _count: { select: { directReports: true } } },
  })
  // HR logins may raise requests even without a linked Employee profile (they often aren't
  // in the Employee tree themselves); everyone else needs one.
  const isHr = roleMatches(session.user.role, ['HR'])
  const canRequest = isHr || (!!me && canRaiseRecruitmentRequest(session.user.email, me._count.directReports, session.user.role))
  const pendingUserInterviews = await db.candidate.count({
    where: { recruitmentRequest: { requestedById: session.user.id }, status: 'USER_INTERVIEW', userInterviewResult: null },
  })

  if (req.nextUrl.searchParams.get('summary') === '1') {
    const hasRequests = canRequest || (await db.recruitmentRequest.count({ where: { requestedById: session.user.id } })) > 0
    return NextResponse.json({ canRequest, hasRequests, pendingUserInterviews })
  }

  const [requests, roles, locations, employees] = await Promise.all([
    db.recruitmentRequest.findMany({
      where: { requestedById: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        ...RECRUITMENT_REQUEST_INCLUDE,
        candidates: {
          where: REQUESTER_VISIBLE_CANDIDATE,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, fullName: true, status: true, phone: true, email: true, location: true,
            expectedSalary: true, readyJoinDate: true, skills: true, languages: true, resumeFiles: true,
            hrInterviewResult: true, hrInterviewNotes: true,
            userInterviewScheduledAt: true, userInterviewMeetingLink: true,
            userInterviewResult: true, userInterviewNotes: true, userInterviewRecordedAt: true,
          },
        },
      },
    }),
    canRequest
      ? db.employeeRole.findMany({
          where: { isActive: true },
          orderBy: { title: 'asc' },
          select: { id: true, title: true, jobDescription: true, location: { select: { id: true, name: true } } },
        })
      : [],
    canRequest
      ? db.employeeWorkLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : [],
    // "Replacing" picker — inactive ones included since the person may already have left.
    canRequest
      ? db.employee.findMany({
          orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
          select: { id: true, fullName: true, isActive: true, managerId: true, department: true, role: { select: { id: true, title: true } } },
        })
      : [],
  ])

  // Requestor block on the form — read-only, straight from the employee record (HR without a
  // linked profile falls back to their login name).
  const requester = me
    ? { fullName: me.fullName, department: me.department }
    : isHr ? { fullName: session.user.name ?? session.user.email ?? 'HR', department: 'HR' } : null

  // Flag the requester's own direct reports so the picker can list them first.
  const replaceable = employees.map(({ managerId, ...e }) => ({ ...e, inMyTeam: !!me && managerId === me.id }))

  return NextResponse.json({ linked: !!me || isHr, canRequest, pendingUserInterviews, requester, requests, roles, locations, employees: replaceable })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json() as {
    roleId?: string; headcount?: number | string; locationId?: string
    reason?: string; replacementEmployeeId?: string; targetJoinDate?: string; notes?: string
    salary?: number | string | null; priority?: string
  }

  const me = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, department: true, _count: { select: { directReports: true } } },
  })
  const isHr = roleMatches(session.user.role, ['HR'])
  if (!isHr && (!me || !canRaiseRecruitmentRequest(session.user.email, me._count.directReports, session.user.role))) {
    return NextResponse.json({ error: 'Only supervisors and heads with team members can request recruitment' }, { status: 403 })
  }

  if (!body.roleId) return NextResponse.json({ error: 'Please select a position' }, { status: 400 })
  const role = await db.employeeRole.findUnique({ where: { id: body.roleId }, select: { id: true, title: true, isActive: true, jobDescription: true } })
  if (!role || !role.isActive) return NextResponse.json({ error: 'That position is not available' }, { status: 400 })

  const headcount = Number(body.headcount ?? 1)
  if (!Number.isInteger(headcount) || headcount < 1) return NextResponse.json({ error: 'Headcount must be at least 1' }, { status: 400 })

  const reason = body.reason?.trim() ?? ''
  if (!(RECRUITMENT_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: 'Please select a reason' }, { status: 400 })
  let replacement: { id: string; fullName: string } | null = null
  if (reason === 'Replacement') {
    if (!body.replacementEmployeeId) return NextResponse.json({ error: 'Please select the employee being replaced' }, { status: 400 })
    replacement = await db.employee.findUnique({ where: { id: body.replacementEmployeeId }, select: { id: true, fullName: true } })
    if (!replacement) return NextResponse.json({ error: 'That employee no longer exists' }, { status: 400 })
  }

  const priority = body.priority ?? 'MEDIUM'
  if (!(RECRUITMENT_PRIORITIES as readonly string[]).includes(priority)) return NextResponse.json({ error: 'Please select a priority' }, { status: 400 })

  let salary: number | null = null
  if (body.salary !== undefined && body.salary !== null && body.salary !== '') {
    salary = Number(body.salary)
    if (!Number.isFinite(salary) || salary < 0) return NextResponse.json({ error: 'Salary must be a positive number' }, { status: 400 })
  }

  const approverIds = await getRecruitmentApproverIds(db)
  const awaitingApproval = approverIds.some(id => id !== session.user.id)

  const request = await db.recruitmentRequest.create({
    data: {
      roleId: role.id,
      headcount,
      locationId: body.locationId || null,
      reason,
      replacementEmployeeId: replacement?.id ?? null,
      replacementFor: replacement?.fullName ?? null,
      targetJoinDate: body.targetJoinDate ? new Date(body.targetJoinDate) : null,
      salary,
      priority: priority as typeof RECRUITMENT_PRIORITIES[number],
      // Always the role's own job description — requesters can't change it. Stored as a
      // snapshot so the request still shows what it was raised against if HR edits the role later.
      jobDescription: role.jobDescription?.trim() || null,
      notes: body.notes?.trim() || null,
      requestedById: session.user.id,
      requesterEmployeeId: me?.id ?? null,
      requesterDepartment: me?.department?.trim() || (isHr ? 'HR' : null),
      // Approver chain from HR › Recruitment › Approvers — every one must approve before HR
      // sees it. A requester who is on the list counts as having approved their own request.
      status: awaitingApproval ? 'AWAITING_APPROVAL' : 'PENDING',
      approvals: approverIds.length
        ? { create: approverIds.map(approverId => approverId === session.user.id
            ? { approverId, decision: 'APPROVED' as const, decidedAt: new Date() }
            : { approverId }) }
        : undefined,
    },
    include: RECRUITMENT_REQUEST_INCLUDE,
  })

  if (awaitingApproval) {
    await notifyRecruitmentApprovers(db, request, approverIds.filter(id => id !== session.user.id))
  } else {
    await notifyRecruitmentReachedHr(db, request, session.user.id)
  }

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')
  if (awaitingApproval) emitTenantEvent(session.user.tenantId, 'my-approvals')

  return NextResponse.json(request, { status: 201 })
}
