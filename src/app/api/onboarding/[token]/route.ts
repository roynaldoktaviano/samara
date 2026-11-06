import { NextRequest, NextResponse } from 'next/server'
import type { OnboardingForm, PrismaClient } from '@prisma/client'
import {
  findOnboardingByToken, hasOnboardingSession, isOnboardingExpired, resolveOnboardingSession,
} from '@/lib/onboarding-access'
import { ONBOARDING_DOC_KEYS, ONBOARDING_TEXT_FIELDS } from '@/lib/onboarding-fields'
import { saveJoinerValues } from '@/lib/onboarding-save'

// Public (no ERP login) API behind /onboarding/[token]. Unlocked by the PIN — see verify/route.ts.
// File contents are never sent back to the joiner, only how many are uploaded per document,
// so a leaked link + PIN can't be used to download someone's ID card scans.

async function joinerView(db: PrismaClient, form: OnboardingForm) {
  const [role, location] = await Promise.all([
    form.roleId ? db.employeeRole.findUnique({ where: { id: form.roleId }, select: { title: true } }) : null,
    form.locationId ? db.employeeWorkLocation.findUnique({ where: { id: form.locationId }, select: { name: true } }) : null,
  ])
  const values = Object.fromEntries(ONBOARDING_TEXT_FIELDS.map(k => {
    const v = form[k]
    return [k, v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? '')]
  }))
  const docCounts = Object.fromEntries(ONBOARDING_DOC_KEYS.map(k => [k, form[k].length]))
  return {
    status: form.status,
    formType: form.formType,
    isCrew: form.isCrew,
    revisionNote: form.status === 'REVISION_REQUESTED' ? form.revisionNote : null,
    expiresAt: form.expiresAt,
    lastSavedAt: form.lastSavedAt,
    position: role?.title ?? null,
    location: location?.name ?? null,
    department: form.department,
    joinDate: form.joinDate,
    values,
    docCounts,
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await findOnboardingByToken(token)
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: form } = found

  // Once handed in / closed, nothing about the person is shown — just where it stands.
  if (form.status === 'SUBMITTED' || form.status === 'APPROVED' || form.status === 'PROBATION_STARTED' || form.status === 'CANCELLED') {
    return NextResponse.json({ state: 'closed', status: form.status, fullName: form.fullName.split(' ')[0] })
  }
  if (isOnboardingExpired(form)) return NextResponse.json({ error: 'This link has expired' }, { status: 410 })

  if (!(await hasOnboardingSession(req, form))) {
    const lockedUntil = form.pinLockedUntil && form.pinLockedUntil > new Date() ? form.pinLockedUntil : null
    return NextResponse.json({ state: 'pin', lockedUntil })
  }
  return NextResponse.json({ state: 'form', form: await joinerView(db, form) })
}

// Save Draft
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await resolveOnboardingSession(req, token)
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status })

  const body = await req.json().catch(() => null) as { data?: Record<string, unknown> } | null
  if (!body?.data || typeof body.data !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const updated = await saveJoinerValues(s.db, s.form, body.data)
  return NextResponse.json({ ok: true, lastSavedAt: updated.lastSavedAt })
}
