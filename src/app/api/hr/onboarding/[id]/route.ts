import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { DETAIL_OMIT, ONBOARDING_HR_ROLES, ONBOARDING_INCLUDE, hrFieldsFromBody } from '@/lib/onboarding-hr'

async function auth() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ONBOARDING_HR_ROLES)) return null
  return { session, db: await getDb(session) }
}

// Full record incl. document data URLs — only loaded when HR opens one form.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const form = await a.db.onboardingForm.findUnique({ where: { id }, omit: DETAIL_OMIT, include: ONBOARDING_INCLUDE })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(form)
}

// HR edit — internal fields and corrections to the joiner's data. Closed forms are frozen.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await a.db.onboardingForm.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PROBATION_STARTED' || existing.status === 'CANCELLED') {
    return NextResponse.json({ error: 'This onboarding form is closed — edit the employee record instead' }, { status: 409 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const form = await a.db.onboardingForm.update({
    where: { id }, data: hrFieldsFromBody(body), omit: DETAIL_OMIT, include: ONBOARDING_INCLUDE,
  })
  return NextResponse.json(form)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth()
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await a.db.onboardingForm.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PROBATION_STARTED') {
    return NextResponse.json({ error: 'This form already created an employee and is kept as their onboarding record' }, { status: 409 })
  }
  await a.db.onboardingForm.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
