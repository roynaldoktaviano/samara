import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

// Payroll sits behind a second password prompt on top of the normal role check, so a
// logged-in HR/Admin laptop left open doesn't expose everyone's salary. Re-entering the
// password (POST /api/hr/payroll/unlock) sets a signed, httpOnly cookie bound to that user;
// every payroll API route requires it, so the data can't be pulled with a plain fetch either.
// The Payroll page clears it again on leave, and it hard-expires after UNLOCK_TTL_MS.

export const PAYROLL_UNLOCK_COOKIE = 'payroll_unlock'
const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000
const COOKIE_PATH = '/api/hr/payroll'

function key() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

function sign(body: string) {
  return crypto.createHmac('sha256', key()).update(`payroll-unlock:${body}`).digest('base64url')
}

export function setPayrollUnlockCookie(res: NextResponse, session: Session) {
  const body = Buffer.from(JSON.stringify({
    uid: session.user.id,
    tid: session.user.tenantId ?? null,
    exp: Date.now() + UNLOCK_TTL_MS,
  })).toString('base64url')
  res.cookies.set(PAYROLL_UNLOCK_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_PATH,
  })
}

export function clearPayrollUnlockCookie(res: NextResponse) {
  res.cookies.set(PAYROLL_UNLOCK_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 })
}

async function isUnlocked(session: Session) {
  const raw = (await cookies()).get(PAYROLL_UNLOCK_COOKIE)?.value
  if (!raw) return false
  const [body, sig] = raw.split('.')
  if (!body || !sig) return false
  const expected = sign(body)
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { uid?: string; tid?: string | null; exp?: number }
    return p.uid === session.user.id && (p.tid ?? null) === (session.user.tenantId ?? null) && !!p.exp && p.exp > Date.now()
  } catch {
    return false
  }
}

/** Null when this session has unlocked payroll; otherwise the 423 response to return. */
export async function requirePayrollUnlock(session: Session): Promise<NextResponse | null> {
  if (await isUnlocked(session)) return null
  return NextResponse.json({ error: 'Payroll is locked — re-enter your password', locked: true }, { status: 423 })
}
