import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'

// Optional post-trip report — identity-based (only the trip's own requester can add/edit
// it), once HR has APPROVED the trip (still editable after the requester CLOSEs it, since
// this is purely informational and closing shouldn't lock out a late edit). Nothing
// downstream (including the reimbursement flow) depends on a report being filled in.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.businessTrip.findUnique({
    where: { id },
    include: { employee: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.employee.userId !== session.user.id) return NextResponse.json({ error: 'This trip is not yours' }, { status: 403 })
  if (existing.status !== 'APPROVED' && existing.status !== 'CLOSED') return NextResponse.json({ error: 'You can only add a report once the trip is approved' }, { status: 409 })

  const { report, reportFileKeys } = await req.json() as { report?: string; reportFileKeys?: string[] }

  const updated = await db.businessTrip.update({
    where: { id },
    data: {
      report: report?.trim() || null,
      reportFileKeys: Array.isArray(reportFileKeys) ? reportFileKeys : [],
      reportSubmittedAt: new Date(),
    },
  })

  emitTenantEvent(session.user.tenantId, 'hr-business-trips')

  return NextResponse.json(updated)
}
