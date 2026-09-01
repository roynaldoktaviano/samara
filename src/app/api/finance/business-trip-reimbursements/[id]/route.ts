import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { emitTenantEvent } from '@/lib/realtime-bus'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const reimbursement = await db.businessTripReimbursement.findUnique({
    where: { id },
    include: {
      businessTrip: { select: { destination: true, purpose: true, startDate: true, endDate: true, employee: { select: { fullName: true, employeeNumber: true } } } },
      requestedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  })
  if (!reimbursement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(reimbursement)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.businessTripReimbursement.findUnique({
    where: { id },
    select: { status: true, amount: true, requesterName: true, businessTripId: true, businessTrip: { select: { destination: true, employee: { select: { userId: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PAID') return NextResponse.json({ error: 'This reimbursement has already been marked as paid' }, { status: 409 })

  const body = await req.json()
  const { transferProofKeys } = body
  if (!Array.isArray(transferProofKeys) || transferProofKeys.length === 0) return NextResponse.json({ error: 'At least one transfer proof photo is required' }, { status: 400 })

  const updated = await db.businessTripReimbursement.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidById: session.user.id,
      transferProofKeys,
      updatedAt: new Date(),
    },
  })

  if (existing.businessTrip.employee.userId) {
    const title = 'Business trip reimbursement paid'
    const body = `Your reimbursement for the trip to ${existing.businessTrip.destination} has been paid (Rp ${new Intl.NumberFormat('id-ID').format(existing.amount)}).`
    await db.notification.create({ data: { userId: existing.businessTrip.employee.userId, type: 'BUSINESS_TRIP_REIMBURSEMENT_PAID', title, body } }).catch(() => {})
    sendPushToUsers(db, [existing.businessTrip.employee.userId], { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'finance-business-trip-reimbursements')
  return NextResponse.json(updated)
}
