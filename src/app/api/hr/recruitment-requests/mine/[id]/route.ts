import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { emitTenantEvent } from '@/lib/realtime-bus'
import { RECRUITMENT_REQUEST_INCLUDE } from '@/lib/hr/recruitment'

// Requester withdraws their own request — only while HR hasn't decided it yet.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { action } = await req.json() as { action?: string }
  if (action !== 'cancel') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const existing = await db.recruitmentRequest.findUnique({ where: { id }, select: { requestedById: true, status: true } })
  if (!existing || existing.requestedById !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 409 })

  const updated = await db.recruitmentRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: RECRUITMENT_REQUEST_INCLUDE })
  emitTenantEvent(session.user.tenantId, 'hr-recruitment')
  return NextResponse.json(updated)
}
