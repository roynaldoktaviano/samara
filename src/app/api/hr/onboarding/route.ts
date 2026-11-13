import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import {
  appBaseUrl, newOnboardingExpiry, newOnboardingPin, newOnboardingToken, onboardingLink, sendOnboardingEmail,
} from '@/lib/onboarding-access'
import {
  LIST_OMIT, ONBOARDING_HR_ROLES, ONBOARDING_INCLUDE, addMonths, employeeUpdatePrefill, hrFieldsFromBody,
} from '@/lib/onboarding-hr'
import { DEFAULT_PROBATION_MONTHS } from '@/lib/onboarding-fields'
import { matchEmployeesToYachts } from '@/lib/payroll'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const forms = await db.onboardingForm.findMany({
    orderBy: { createdAt: 'desc' },
    omit: LIST_OMIT,
    include: ONBOARDING_INCLUDE,
  })
  return NextResponse.json(forms)
}

/**
 * Creates an Onboarding Form — from a Candidate (prefilled from it and its Recruitment
 * Request), standalone, or — with `employeeId` — an Employee Data Update form for an existing
 * employee (prefilled with their current data/documents; applied back to them on approval).
 * Returns the plain PIN exactly once; only its hash is stored.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const candidateId = typeof body.candidateId === 'string' && body.candidateId ? body.candidateId : null
  const targetEmployeeId = typeof body.employeeId === 'string' && body.employeeId ? body.employeeId : null
  const prefill: Record<string, unknown> = {}
  if (targetEmployeeId) {
    const employee = await db.employee.findUnique({ where: { id: targetEmployeeId } })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    const active = await db.onboardingForm.findFirst({
      where: { targetEmployeeId, status: { notIn: ['APPLIED', 'CANCELLED'] } },
      select: { id: true },
    })
    if (active) return NextResponse.json({ error: 'This employee already has an open data form — open it in HR › Onboarding', existingId: active.id }, { status: 409 })
    Object.assign(prefill, employeeUpdatePrefill(employee))
  } else if (candidateId) {
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      include: { recruitmentRequest: { select: { locationId: true, requesterEmployeeId: true, employmentStatus: true } } },
    })
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    const active = await db.onboardingForm.findFirst({
      where: { candidateId, status: { notIn: ['CANCELLED'] } },
      select: { id: true, status: true },
    })
    if (active) return NextResponse.json({ error: 'This candidate already has an onboarding form', existingId: active.id }, { status: 409 })
    Object.assign(prefill, {
      fullName: candidate.fullName,
      phone: candidate.phone,
      inviteEmail: candidate.email,
      personalEmail: candidate.email,
      roleId: candidate.appliedRoleId,
      locationId: candidate.recruitmentRequest?.locationId ?? null,
      managerId: candidate.recruitmentRequest?.requesterEmployeeId ?? null,
      joinDate: candidate.readyJoinDate?.toISOString() ?? null,
      formType: candidate.recruitmentRequest?.employmentStatus === 'Freelance' ? 'FREELANCE' : 'STANDARD',
    })
  }

  // Explicit values from HR win over the candidate prefill (empty strings don't overwrite it).
  const merged = { ...prefill, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== undefined)) }
  const data = hrFieldsFromBody(merged)
  const fullName = typeof data.fullName === 'string' ? data.fullName : ''
  if (!fullName) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  // Crew default: work location named after a yacht (same rule as payroll's Uang Layar).
  if (!('isCrew' in body) && typeof data.locationId === 'string') {
    const [loc, yachts] = await Promise.all([
      db.employeeWorkLocation.findUnique({ where: { id: data.locationId }, select: { name: true } }),
      db.yacht.findMany({ select: { id: true, name: true } }),
    ])
    data.isCrew = matchEmployeesToYachts([{ id: 'x', locationName: loc?.name ?? null }], yachts).has('x')
  }
  if (!targetEmployeeId && data.joinDate instanceof Date && !data.probationEndDate && data.formType !== 'FREELANCE') {
    data.probationEndDate = addMonths(data.joinDate, DEFAULT_PROBATION_MONTHS)
  }

  const { pin, pinHash } = await newOnboardingPin()
  const token = newOnboardingToken()
  const form = await db.onboardingForm.create({
    data: {
      ...data,
      fullName,
      candidateId: targetEmployeeId ? null : candidateId,
      purpose: targetEmployeeId ? 'EMPLOYEE_UPDATE' : 'NEW_JOINER',
      targetEmployeeId,
      token,
      pinHash,
      expiresAt: newOnboardingExpiry(),
      createdById: session.user.id,
    },
    omit: LIST_OMIT,
    include: ONBOARDING_INCLUDE,
  })

  const link = onboardingLink(appBaseUrl(req), token)
  let email: { ok: boolean; error?: string } | null = null
  if (body.sendEmail === true && form.inviteEmail) {
    email = await sendOnboardingEmail({
      tenantId: session.user.tenantId, to: form.inviteEmail, fullName: form.fullName, link,
      roleTitle: form.role?.title, expiresAt: form.expiresAt, kind: 'invite', purpose: form.purpose,
    })
  }

  return NextResponse.json({ form, pin, link, email }, { status: 201 })
}
