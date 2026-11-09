import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { centralDb } from '@/lib/central-db'
import bcrypt from 'bcryptjs'

// Re-confirms the currently signed-in user's own password — used to gate reveal of
// sensitive on-screen data (e.g. salary figures) without a full re-login. Never
// compares against anyone else's password; always checks the session user's own hash.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await request.json()
  if (!password || typeof password !== 'string') return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  // A super admin who opened this ERP from the dashboard confirms with their super admin password
  // (their tenant row's password is random and unusable — see src/lib/super-admin-enter.ts).
  const centralId = session.user.enteredBySuperAdminId
  const user = centralId
    ? await centralDb.centralUser.findUnique({ where: { id: centralId }, select: { password: true } })
    : await (await getDb(session)).user.findUnique({ where: { id: session.user.id }, select: { password: true } })
  if (!user?.password) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

  return NextResponse.json({ ok: true })
}
