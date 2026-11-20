import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { decideAdUploadChange } from '@/lib/ad-offline-feed'

// Approve / reject a queued value or time change on an already-prepared feed row (parity D, rule 6).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { approve } = await req.json() as { approve?: boolean }
  if (typeof approve !== 'boolean') return NextResponse.json({ error: 'approve (boolean) is required' }, { status: 400 })
  const db = await getDb(session)
  const r = await decideAdUploadChange(db, (await params).id, approve, session.user.id)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 })
}
