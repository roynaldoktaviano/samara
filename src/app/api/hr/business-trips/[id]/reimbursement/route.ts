import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { emitTenantEvent } from '@/lib/realtime-bus'
import { sendPushToUsers } from '@/lib/push'

const FINANCE_ROLES = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

// Identity-based (only the trip's own requester can file a claim against it), gated to
// APPROVED trips — mirrors src/app/api/purchasing/orders/[id]/reimbursement/route.ts but
// routes straight to Finance with no Purchasing stage in between.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const trip = await db.businessTrip.findUnique({
    where: { id },
    include: { employee: { select: { userId: true, fullName: true } } },
  })
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (trip.employee.userId !== session.user.id) return NextResponse.json({ error: 'This trip is not yours' }, { status: 403 })
  if (trip.status !== 'APPROVED') return NextResponse.json({ error: 'You can only request a reimbursement once the trip is approved' }, { status: 409 })

  const reqBody = await req.json()
  const { amount, notePhotoKeys, notes, notaDate, requesterName, bankName, accountNumber, accountHolderName } = reqBody
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })
  if (!requesterName?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
  if (!accountNumber?.trim()) return NextResponse.json({ error: 'Account number is required' }, { status: 400 })
  if (!accountHolderName?.trim()) return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })

  const amountFormatted = `Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))}`

  const reimbursement = await db.businessTripReimbursement.create({
    data: {
      id: crypto.randomUUID(),
      businessTripId: id,
      requestedById: session.user.id,
      amount: Number(amount),
      notePhotoKeys,
      notes: notes?.trim() || null,
      notaDate: notaDate ? new Date(notaDate) : null,
      requesterName: requesterName.trim(),
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      updatedAt: new Date(),
    },
  })

  const financeUsers = await db.user.findMany({ where: { role: { in: FINANCE_ROLES as never[] } }, select: { id: true } })
  const title = 'Business trip reimbursement requested'
  const body = `${requesterName.trim()} requested a reimbursement for their trip to ${trip.destination} (${amountFormatted}).`
  if (financeUsers.length) {
    await db.notification.createMany({
      data: financeUsers.map(u => ({ userId: u.id, type: 'BUSINESS_TRIP_REIMBURSEMENT_REQUESTED', title, body })),
    }).catch(() => {})
    sendPushToUsers(db, financeUsers.map(u => u.id), { title, body }).catch(() => {})
  }

  emitTenantEvent(session.user.tenantId, 'finance-business-trip-reimbursements')

  return NextResponse.json(reimbursement, { status: 201 })
}
