import { NextRequest, NextResponse } from 'next/server'
import {
  checkOnboardingPin, findOnboardingByToken, isOnboardingExpired, setOnboardingSession,
  PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS,
} from '@/lib/onboarding-access'
import { exceedsRateLimit } from '@/lib/rate-limit'

// PIN check for the public Onboarding Form. Two brakes on guessing a 6-digit PIN:
//  - per form: PIN_MAX_ATTEMPTS wrong tries lock the form for PIN_LOCK_MINUTES (stored on the
//    row, so it survives restarts; HR's "Reset PIN" also clears it);
//  - per IP: a coarse volume cap across all forms, so one client can't spray many links.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  if (exceedsRateLimit(`onboarding-pin:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const { token } = await params
  const found = await findOnboardingByToken(token)
  if (!found) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  const { db, record: form } = found
  if (form.status !== 'INVITED' && form.status !== 'REVISION_REQUESTED') {
    return NextResponse.json({ error: 'This form can no longer be edited' }, { status: 409 })
  }
  if (isOnboardingExpired(form)) return NextResponse.json({ error: 'This link has expired' }, { status: 410 })

  const now = new Date()
  if (form.pinLockedUntil && form.pinLockedUntil > now) {
    return NextResponse.json({ error: 'Too many wrong PINs. Try again later or ask HR to reset your PIN.', lockedUntil: form.pinLockedUntil }, { status: 423 })
  }

  const body = await req.json().catch(() => null) as { pin?: unknown } | null
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
  if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 6 digits' }, { status: 400 })

  if (!(await checkOnboardingPin(pin, form.pinHash))) {
    const attempts = form.pinFailedAttempts + 1
    const lock = attempts >= PIN_MAX_ATTEMPTS
    await db.onboardingForm.update({
      where: { id: form.id },
      data: lock
        ? { pinFailedAttempts: 0, pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60 * 1000) }
        : { pinFailedAttempts: attempts },
    })
    return NextResponse.json(lock
      ? { error: `Too many wrong PINs. The form is locked for ${PIN_LOCK_MINUTES} minutes — or ask HR to reset your PIN.` }
      : { error: `Wrong PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt${PIN_MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left.` },
    { status: lock ? 423 : 401 })
  }

  if (form.pinFailedAttempts || form.pinLockedUntil) {
    await db.onboardingForm.update({ where: { id: form.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } })
  }
  const res = NextResponse.json({ ok: true })
  await setOnboardingSession(res, form)
  return res
}
