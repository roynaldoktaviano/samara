import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

// A sales rep's own Online / Offline switch (header, next to their name). Offline = User.salesAway:
// round-robin skips them in every channel and brand (src/lib/sales-availability.ts); the contacts
// they already own stay theirs. Admins still set it for anyone in Leads Distribution.
async function me() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const db = await getDb(session)
  return { session, db }
}

export async function GET() {
  const ctx = await me()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const u = await ctx.db.user.findUnique({ where: { id: ctx.session.user.id }, select: { role: true, salesAway: true } })
  if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ isSales: u.role === 'SALES', online: !u.salesAway })
}

export async function POST(req: NextRequest) {
  const ctx = await me()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { online } = await req.json() as { online?: boolean }
  if (typeof online !== 'boolean') return NextResponse.json({ error: 'online (boolean) is required' }, { status: 400 })
  const { count } = await ctx.db.user.updateMany({ where: { id: ctx.session.user.id, role: 'SALES' }, data: { salesAway: !online } })
  if (!count) return NextResponse.json({ error: 'Only sales reps have an online switch' }, { status: 403 })
  const s = ctx.session
  logActivity({
    userId: s.user.id, userName: s.user.name ?? s.user.email ?? 'Unknown', userRole: (s.user as { role?: string }).role ?? '',
    action: 'UPDATE', entity: 'User', entityId: s.user.id, detail: `Leads Distribution: went ${online ? 'Online' : 'Offline'}`,
  }, ctx.db).catch(() => {})
  return NextResponse.json({ ok: true, online })
}
