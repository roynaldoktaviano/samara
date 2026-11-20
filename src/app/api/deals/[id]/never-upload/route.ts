import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

// Put a deal on / off the never-upload list (Freshsales never_upload.json): it is never sent to
// Google or Meta offline feeds (src/lib/ad-offline-feed.ts, exclusion 2).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { neverUpload } = await req.json() as { neverUpload?: boolean }
  if (typeof neverUpload !== 'boolean') return NextResponse.json({ error: 'neverUpload (boolean) is required' }, { status: 400 })
  const db = await getDb(session)
  const { id } = await params
  const deal = await db.deal.update({ where: { id }, data: { neverUpload }, select: { orderId: true } }).catch(() => null)
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  logActivity({
    userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown', userRole: role,
    action: 'UPDATE', entity: 'Deal', entityId: id, detail: `Offline feed: deal ${deal.orderId ?? id} ${neverUpload ? 'put on' : 'removed from'} the never-upload list`,
  }, db).catch(() => {})
  return NextResponse.json({ ok: true })
}
