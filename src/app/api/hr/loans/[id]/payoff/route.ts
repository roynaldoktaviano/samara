import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

// Settles every remaining PENDING installment on an approved loan at once — e.g. the
// employee resigns and pays back the outstanding balance directly, outside the normal
// month-by-month payroll deduction cadence.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const loan = await db.loanRequest.findUnique({ where: { id }, select: { status: true } })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (loan.status !== 'APPROVED') return NextResponse.json({ error: 'Only an approved loan can be paid off' }, { status: 409 })

  const pending = await db.loanInstallment.findMany({ where: { loanRequestId: id, status: 'PENDING' } })
  if (pending.length === 0) return NextResponse.json({ error: 'No remaining installments to pay off' }, { status: 409 })

  const now = new Date()
  await db.$transaction(
    pending.map(i => db.loanInstallment.update({ where: { id: i.id }, data: { status: 'PAID', paidAt: now, paidAmount: i.amount } })),
  )
  return NextResponse.json({ ok: true, count: pending.length })
}
