import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// Per-user opt-out for My Works emails (task assigned / task completed).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { taskEmailOptOut: true } })
  return NextResponse.json({ emailEnabled: !me?.taskEmailOptOut })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json().catch(() => ({}))
  if (typeof body.emailEnabled !== 'boolean') return NextResponse.json({ error: 'emailEnabled must be a boolean' }, { status: 400 })
  await db.user.update({ where: { id: session.user.id }, data: { taskEmailOptOut: !body.emailEnabled } })
  return NextResponse.json({ emailEnabled: body.emailEnabled })
}
