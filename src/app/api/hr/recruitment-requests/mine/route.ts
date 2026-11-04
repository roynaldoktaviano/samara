import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { RECRUITMENT_REASONS, RECRUITMENT_REQUEST_INCLUDE, REQUESTER_VISIBLE_CANDIDATE } from '@/lib/hr/recruitment'

const HR_FALLBACK = ['ADMIN', 'SUPER_ADMIN', 'HR']

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
    select: { id: true, _count: { select: { directReports: true } } },
  })
  const canRequest = !!me && me._count.directReports > 0
  const pendingUserInterviews = await db.candidate.count({
    where: { recruitmentRequest: { requestedById: session.user.id }, status: 'USER_INTERVIEW', userInterviewResult: null },
  })

  if (req.nextUrl.searchParams.get('summary') === '1') {
    const hasRequests = canRequest || (await db.recruitmentRequest.count({ where: { requestedById: session.user.id } })) > 0
    return NextResponse.json({ canRequest, hasRequests, pendingUserInterviews })
  }

  const [requests, roles, locations] = await Promise.all([
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
  ])

  return NextResponse.json({ linked: !!me, canRequest, pendingUserInterviews, requests, roles, locations })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json() as {
    roleId?: string; headcount?: number | string; locationId?: string; employmentStatus?: string
    reason?: string; replacementFor?: string; targetJoinDate?: string; jobDescription?: string; notes?: string
  }

  const me = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, _count: { select: { directReports: true } } },
  })
  if (!me || me._count.directReports === 0) {
    return NextResponse.json({ error: 'Only supervisors and heads with team members can request recruitment' }, { status: 403 })
  }

  if (!body.roleId) return NextResponse.json({ error: 'Please select a position' }, { status: 400 })
  const role = await db.employeeRole.findUnique({ where: { id: body.roleId }, select: { id: true, title: true, isActive: true, jobDescription: true } })
  if (!role || !role.isActive) return NextResponse.json({ error: 'That position is not available' }, { status: 400 })

  const headcount = Number(body.headcount ?? 1)
  if (!Number.isInteger(headcount) || headcount < 1) return NextResponse.json({ error: 'Headcount must be at least 1' }, { status: 400 })

  const reason = body.reason?.trim() ?? ''
  if (!(RECRUITMENT_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: 'Please select a reason' }, { status: 400 })
  if (reason === 'Replacement' && !body.replacementFor?.trim()) {
    return NextResponse.json({ error: 'Please fill in who is being replaced' }, { status: 400 })
  }

  const request = await db.recruitmentRequest.create({
    data: {
      roleId: role.id,
      headcount,
      locationId: body.locationId || null,
      employmentStatus: body.employmentStatus?.trim() || null,
      reason,
      replacementFor: reason === 'Replacement' ? body.replacementFor!.trim() : null,
      targetJoinDate: body.targetJoinDate ? new Date(body.targetJoinDate) : null,
      // Not sent → fall back to the Role's own job description.
      jobDescription: (body.jobDescription !== undefined ? body.jobDescription : role.jobDescription)?.trim() || null,
      notes: body.notes?.trim() || null,
      requestedById: session.user.id,
      requesterEmployeeId: me.id,
    },
    include: RECRUITMENT_REQUEST_INCLUDE,
  })

  const hrUsers = await db.user.findMany({ where: { role: { in: HR_FALLBACK as never[] } }, select: { id: true } })
  if (hrUsers.length) {
    const title = 'New recruitment request'
    const notifBody = `${me.fullName} requested to hire ${headcount}× ${role.title}.`
    await db.notification.createMany({ data: hrUsers.map(u => ({ userId: u.id, type: 'RECRUITMENT_REQUESTED', title, body: notifBody })) }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body: notifBody }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'hr-recruitment')

  return NextResponse.json(request, { status: 201 })
}
