import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { notifyByRole } from '@/lib/notify-purchasing'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const order = await db.purchaseOrder.findUnique({ where: { id }, select: { id: true, poNumber: true, supplierName: true } })
  if (!order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const body = await req.json()
  const { amount, notePhotoKey, notes } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!notePhotoKey) return NextResponse.json({ error: 'Receipt/nota photo is required' }, { status: 400 })

  const paymentRequest = await db.pOPaymentRequest.create({
    data: {
      id: crypto.randomUUID(),
      orderId: id,
      requestedById: session.user.id,
      amount: Number(amount),
      notePhotoKey,
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    },
  })

  notifyByRole(db, ['FINANCE', 'ADMIN', 'SUPER_ADMIN'], 'PO_PAYMENT_REQUESTED',
    'Payment Request Submitted',
    `${order.poNumber}${order.supplierName ? ` — ${order.supplierName}` : ''} needs payment approval (Rp ${new Intl.NumberFormat('id-ID').format(Number(amount))})`,
    id,
  ).catch(console.error)

  return NextResponse.json(paymentRequest, { status: 201 })
}
