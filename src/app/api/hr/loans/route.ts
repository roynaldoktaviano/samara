import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [loans, openPeriod] = await Promise.all([
    db.loanRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      include: {
        employee: { select: { id: true, fullName: true, employeeNumber: true } },
        requestedBy: { select: { id: true, name: true } },
        installments: { select: { amount: true, status: true, dueYear: true, dueMonth: true } },
      },
    }),
    // "Due this payroll run" uses the earliest OPEN period — the one Generate Entries
    // would actually pull installments into next.
    db.payrollPeriod.findFirst({ where: { status: 'OPEN' }, orderBy: [{ year: 'asc' }, { month: 'asc' }], select: { year: true, month: true } }),
  ])

  const totalOutstanding = loans.reduce((sum, l) => sum + l.installments.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0), 0)
  const pendingRequestsCount = loans.filter(l => l.status !== 'APPROVED' && l.status !== 'REJECTED').length
  const dueThisPayrollRun = openPeriod
    ? loans.reduce((sum, l) => sum + l.installments
        .filter(i => i.status === 'PENDING' && i.dueYear === openPeriod.year && i.dueMonth === openPeriod.month)
        .reduce((s, i) => s + i.amount, 0), 0)
    : 0

  return NextResponse.json({
    loans: loans.map(({ installments: _installments, ...l }) => l),
    stats: { totalOutstanding, pendingRequestsCount, dueThisPayrollRun },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { employeeId, amount, termMonths, reason } = await req.json()
  if (!employeeId) return NextResponse.json({ error: 'Please select an employee' }, { status: 400 })
  const principal = Number(amount)
  const term = Number(termMonths)
  if (!Number.isFinite(principal) || principal <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!Number.isInteger(term) || term <= 0) return NextResponse.json({ error: 'Term (months) must be a whole number greater than 0' }, { status: 400 })

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, fullName: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // No Supervisor stage — every loan request starts at HR regardless of the employee's
  // manager (dropped per the user; see LoanRequestStatus in schema.prisma).
  const loan = await db.loanRequest.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      amount: principal,
      termMonths: term,
      reason: reason?.trim() || null,
      status: 'PENDING_HR',
      requestedById: session.user.id,
    },
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true } } },
  })

  const hrUsers = await db.user.findMany({ where: { role: { in: ALLOWED as never[] }, id: { not: session.user.id } }, select: { id: true } })
  if (hrUsers.length) {
    const title = 'Loan request needs HR review'
    const body = `${employee.fullName} — loan request submitted, waiting for HR review.`
    await db.notification.createMany({ data: hrUsers.map(u => ({ userId: u.id, type: 'LOAN_HR_APPROVAL_NEEDED', title, body })) }).catch(() => {})
    sendPushToUsers(db, hrUsers.map(u => u.id), { title, body }).catch(() => {})
  }

  return NextResponse.json(loan, { status: 201 })
}
