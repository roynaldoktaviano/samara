import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

// Manually reconciles one installment outside the normal payroll-deduction path — e.g.
// an off-cycle repayment, or clearing an arrears backlog that a single payroll period
// couldn't cover (see LoanInstallment.payslipEntryId's comment in schema.prisma).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const installment = await db.loanInstallment.findUnique({ where: { id } })
  if (!installment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (installment.status === 'PAID') return NextResponse.json({ error: 'This installment is already marked paid' }, { status: 409 })

  const body = await req.json() as { paidAmount?: number }
  const paidAmount = Number.isFinite(Number(body.paidAmount)) && Number(body.paidAmount) > 0 ? Number(body.paidAmount) : installment.amount

  const updated = await db.loanInstallment.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date(), paidAmount },
  })
  return NextResponse.json(updated)
}
