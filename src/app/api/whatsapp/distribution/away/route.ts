import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

// Leads Distribution "Away" switch (admin): while on, round-robin skips this sales rep in every
// channel and brand, and new deals don't go to them as contact owner (src/lib/sales-availability.ts).
// Approved leave and resignation are picked up automatically — this is for anything else.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId, away } = await req.json() as { userId?: string; away?: boolean }
  if (typeof userId !== 'string' || typeof away !== 'boolean') return NextResponse.json({ error: 'userId and away are required' }, { status: 400 })
  const db = await getDb(session)
  const user = await db.user.findFirst({ where: { id: userId, role: 'SALES' }, select: { name: true, email: true } })
  if (!user) return NextResponse.json({ error: 'Not a sales rep' }, { status: 404 })
  await db.user.update({ where: { id: userId }, data: { salesAway: away } })
  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown', userRole: role,
    action: 'UPDATE', entity: 'User', entityId: userId, detail: `Leads Distribution: ${user.name ?? user.email} ${away ? 'set Away' : 'back from Away'}`,
  }, db).catch(() => {})
  return NextResponse.json({ ok: true })
}
