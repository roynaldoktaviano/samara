import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'HR', 'ADMIN', 'SUPER_ADMIN']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; reimbursementId: string }> }) {
  const { id, reimbursementId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json()
  const { amount, notePhotoKeys, notes, notaDate, requesterName, bankName, accountNumber, accountHolderName } = body
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Array.isArray(notePhotoKeys) || notePhotoKeys.length === 0) return NextResponse.json({ error: 'At least one receipt/nota photo is required' }, { status: 400 })
  if (!requesterName?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
  if (!accountNumber?.trim()) return NextResponse.json({ error: 'Account number is required' }, { status: 400 })
  if (!accountHolderName?.trim()) return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })

  const result = await db.pOReimbursement.updateMany({
    where: { id: reimbursementId, orderId: id },
    data: {
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
  if (result.count === 0) return NextResponse.json({ error: 'Reimbursement not found' }, { status: 404 })

  const updated = await db.pOReimbursement.findUnique({ where: { id: reimbursementId } })
  return NextResponse.json(updated)
}
