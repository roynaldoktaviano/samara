import { NextRequest, NextResponse } from 'next/server'
import { resolveOnboardingSession } from '@/lib/onboarding-access'
import { ONBOARDING_DOC_KEYS, ONBOARDING_TEXT_FIELDS, missingOnboardingFields } from '@/lib/onboarding-fields'
import { sendPushToUsers } from '@/lib/push'
import { saveJoinerValues } from '@/lib/onboarding-save'

import type { Role } from '@prisma/client'

const HR_NOTIFY_ROLES: Role[] = ['HR', 'ADMIN', 'SUPER_ADMIN']

// Saves the latest values, checks every required field/document, then hands the form to HR.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await resolveOnboardingSession(req, token)
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status })
  const { db } = s

  const body = await req.json().catch(() => null) as { data?: Record<string, unknown> } | null
  const form = body?.data && typeof body.data === 'object' ? await saveJoinerValues(db, s.form, body.data) : s.form

  const values = Object.fromEntries(ONBOARDING_TEXT_FIELDS.map(k => {
    const v = form[k]
    return [k, v instanceof Date ? v.toISOString() : v]
  }))
  const docCounts = Object.fromEntries(ONBOARDING_DOC_KEYS.map(k => [k, form[k].length]))
  const missing = missingOnboardingFields(values, docCounts, { formType: form.formType, isCrew: form.isCrew })
  if (missing.length) {
    return NextResponse.json({ error: `Please complete: ${missing.join(', ')}`, missing }, { status: 400 })
  }

  const wasRevision = form.status === 'REVISION_REQUESTED'
  await db.onboardingForm.update({
    where: { id: form.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  })

  // Bell + device push to HR. Prefer actual HR accounts; fall back to admins if there are none.
  const hr = await db.user.findMany({ where: { role: 'HR' }, select: { id: true } })
  const recipients = hr.length ? hr : await db.user.findMany({ where: { role: { in: HR_NOTIFY_ROLES } }, select: { id: true } })
  if (recipients.length) {
    const what = form.purpose === 'EMPLOYEE_UPDATE' ? 'employee data form' : 'onboarding form'
    const title = `${what.charAt(0).toUpperCase()}${what.slice(1)} ${wasRevision ? 'resubmitted' : 'submitted'}`
    const text = `${form.fullName} ${wasRevision ? 'updated and resubmitted' : 'submitted'} their ${what} — ready for review in HR › Onboarding.`
    await db.notification.createMany({ data: recipients.map(u => ({ userId: u.id, type: 'ONBOARDING_SUBMITTED', title, body: text })) }).catch(() => {})
    sendPushToUsers(db, recipients.map(u => u.id), { title, body: text }).catch(console.error)
  }

  return NextResponse.json({ ok: true })
}
