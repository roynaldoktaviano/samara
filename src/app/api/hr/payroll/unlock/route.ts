import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { centralDb } from '@/lib/central-db'
import { roleMatches } from '@/lib/role-utils'
import { isRateLimited, recordFailedAttempt, clearAttempts } from '@/lib/rate-limit'
import { setPayrollUnlockCookie, clearPayrollUnlockCookie } from '@/lib/payroll-unlock'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

// Re-confirms the signed-in user's own password and unlocks the payroll API for them
// (see src/lib/payroll-unlock.ts). DELETE locks it again.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateKey = `payroll-unlock:${session.user.id}`
  if (isRateLimited(rateKey)) return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  if (!password || typeof password !== 'string') return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  // Super admins live in the central DB, everyone else in their tenant DB.
  const hash = session.user.isSuperAdmin
    ? (await centralDb.centralUser.findUnique({ where: { id: session.user.id }, select: { password: true } }))?.password
    : (await (await getDb(session)).user.findUnique({ where: { id: session.user.id }, select: { password: true } }))?.password

  if (!hash || !(await bcrypt.compare(password, hash))) {
    recordFailedAttempt(rateKey)
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  clearAttempts(rateKey)
  const res = NextResponse.json({ ok: true })
  setPayrollUnlockCookie(res, session)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  clearPayrollUnlockCookie(res)
  return res
}
