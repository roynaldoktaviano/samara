import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import {
  appBaseUrl, isOnboardingExpired, newOnboardingExpiry, newOnboardingPin, onboardingLink, sendOnboardingEmail,
} from '@/lib/onboarding-access'
import { DETAIL_OMIT, ONBOARDING_HR_ROLES, ONBOARDING_INCLUDE, employeeUpdateFromForm } from '@/lib/onboarding-hr'

type Action = 'request-revision' | 'approve' | 'apply' | 'reset-pin' | 'extend' | 'send-email' | 'cancel'

/**
 * Status/link actions on one Onboarding Form:
 *  - request-revision {note}: SUBMITTED/APPROVED → REVISION_REQUESTED (+ email the joiner)
 *  - approve: SUBMITTED → APPROVED (new-joiner forms)
 *  - apply: Employee Data Update forms — SUBMITTED/APPROVED → writes the data into the
 *    existing employee → APPLIED (terminal)
 *  - reset-pin: new PIN (returned once), ends open sessions, clears any lockout
 *  - extend: link valid for another ONBOARDING_LINK_DAYS
 *  - send-email: (re)send the link email — never contains the PIN
 *  - cancel: → CANCELLED, link stops working
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { action?: Action; note?: string }

  const form = await db.onboardingForm.findUnique({ where: { id }, include: { role: { select: { title: true } } } })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (form.status === 'PROBATION_STARTED' || form.status === 'APPLIED' || form.status === 'CANCELLED') {
    return NextResponse.json({ error: 'This onboarding form is closed' }, { status: 409 })
  }
  const link = onboardingLink(appBaseUrl(req), form.token)
  const reply = async (extra: Record<string, unknown> = {}) => NextResponse.json({
    form: await db.onboardingForm.findUnique({ where: { id }, omit: DETAIL_OMIT, include: ONBOARDING_INCLUDE }),
    link,
    ...extra,
  })

  switch (body.action) {
    case 'request-revision': {
      if (form.status !== 'SUBMITTED' && form.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Only a submitted or approved form can be sent back for revision' }, { status: 400 })
      }
      const note = body.note?.trim()
      if (!note) return NextResponse.json({ error: 'Please tell the joiner what needs to change' }, { status: 400 })
      // The joiner needs a working link to fix it — give an expired/near-expiry one fresh time.
      const expiresAt = isOnboardingExpired(form) || form.expiresAt.getTime() - Date.now() < 3 * 86400_000 ? newOnboardingExpiry() : form.expiresAt
      await db.onboardingForm.update({
        where: { id },
        data: { status: 'REVISION_REQUESTED', revisionNote: note, expiresAt, approvedAt: null, approvedById: null },
      })
      const email = form.inviteEmail
        ? await sendOnboardingEmail({
            tenantId: session.user.tenantId, to: form.inviteEmail, fullName: form.fullName, link,
            roleTitle: form.role?.title, expiresAt, kind: 'revision', revisionNote: note, purpose: form.purpose,
          })
        : null
      return reply({ email })
    }
    case 'approve': {
      if (form.purpose === 'EMPLOYEE_UPDATE') return NextResponse.json({ error: 'Use "Approve & Update Employee" for employee data forms' }, { status: 400 })
      if (form.status !== 'SUBMITTED') return NextResponse.json({ error: 'Only a submitted form can be approved' }, { status: 400 })
      await db.onboardingForm.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedById: session.user.id, revisionNote: null },
      })
      return reply()
    }
    case 'apply': {
      if (form.purpose !== 'EMPLOYEE_UPDATE' || !form.targetEmployeeId) {
        return NextResponse.json({ error: 'Only employee data forms can be applied to an employee' }, { status: 400 })
      }
      if (form.status !== 'SUBMITTED' && form.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Only a submitted form can be applied' }, { status: 400 })
      }
      const targetEmployeeId = form.targetEmployeeId
      const now = new Date()
      const applied = await db.$transaction(async tx => {
        // Guarded on status so a double click can't apply twice.
        const done = await tx.onboardingForm.updateMany({
          where: { id, status: { in: ['SUBMITTED', 'APPROVED'] } },
          data: { status: 'APPLIED', appliedAt: now, approvedAt: form.approvedAt ?? now, approvedById: form.approvedById ?? session.user.id, revisionNote: null },
        })
        if (done.count !== 1) return false
        await tx.employee.update({ where: { id: targetEmployeeId }, data: employeeUpdateFromForm(form) })
        return true
      })
      if (!applied) return NextResponse.json({ error: 'This form was already applied' }, { status: 409 })
      return reply()
    }
    case 'reset-pin': {
      const { pin, pinHash } = await newOnboardingPin()
      await db.onboardingForm.update({
        where: { id },
        data: { pinHash, pinSetAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
      })
      return reply({ pin })
    }
    case 'extend': {
      await db.onboardingForm.update({ where: { id }, data: { expiresAt: newOnboardingExpiry() } })
      return reply()
    }
    case 'send-email': {
      if (!form.inviteEmail) return NextResponse.json({ error: 'Set the joiner\'s email first' }, { status: 400 })
      if (isOnboardingExpired(form)) return NextResponse.json({ error: 'The link has expired — extend it first' }, { status: 400 })
      const email = await sendOnboardingEmail({
        tenantId: session.user.tenantId, to: form.inviteEmail, fullName: form.fullName, link,
        roleTitle: form.role?.title, expiresAt: form.expiresAt,
        kind: form.status === 'REVISION_REQUESTED' ? 'revision' : 'invite', revisionNote: form.revisionNote, purpose: form.purpose,
      })
      if (!email.ok) return NextResponse.json({ error: `Email not sent: ${email.error}` }, { status: 502 })
      return reply({ email })
    }
    case 'cancel': {
      await db.onboardingForm.update({ where: { id }, data: { status: 'CANCELLED' } })
      return reply()
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
