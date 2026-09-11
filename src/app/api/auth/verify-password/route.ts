import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import bcrypt from 'bcryptjs'

// Re-confirms the currently signed-in user's own password — used to gate reveal of
// sensitive on-screen data (e.g. salary figures) without a full re-login. Never
// compares against anyone else's password; always checks the session user's own hash.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await request.json()
  if (!password || typeof password !== 'string') return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  const db = await getDb(session)
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { password: true } })
  if (!user?.password) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

  return NextResponse.json({ ok: true })
}
