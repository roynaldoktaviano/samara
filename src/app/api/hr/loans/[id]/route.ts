import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'

const VIEW_ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']
const HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']
const FINANCE_ROLES = ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'FINANCE_DIRECTOR']
// "Special Approval" has no dedicated senior/owner role in this app — same gap Payroll's
// "Head of Finance" hit, resolved the same way: role-based, not a new field.
const SPECIAL_ROLES = ['ADMIN', 'SUPER_ADMIN']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, VIEW_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const loan = await db.loanRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      requestedBy: { select: { id: true, name: true } },
      hrDecidedBy: { select: { id: true, name: true } },
      financeDecidedBy: { select: { id: true, name: true } },
      specialDecidedBy: { select: { id: true, name: true } },
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(loan)
}

async function notifyRequester(db: Awaited<ReturnType<typeof getDb>>, requestedById: string, title: string, body: string) {
  await db.notification.create({ data: { userId: requestedById, type: 'LOAN_DECIDED', title, body } }).catch(() => {})
  sendPushToUsers(db, [requestedById], { title, body }).catch(() => {})
}

async function notifyRoles(db: Awaited<ReturnType<typeof getDb>>, roles: string[], excludeUserId: string, type: string, title: string, body: string) {
  const users = await db.user.findMany({ where: { role: { in: roles as never[] }, id: { not: excludeUserId } }, select: { id: true } })
  if (!users.length) return
  await db.notification.createMany({ data: users.map(u => ({ userId: u.id, type, title, body })) }).catch(() => {})
  sendPushToUsers(db, users.map(u => u.id), { title, body }).catch(() => {})
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json() as {
    action?: 'hr-decide' | 'finance-decide' | 'special-decide'
    approved?: boolean; note?: string; firstDeductionYear?: number; firstDeductionMonth?: number
  }

  const loan = await db.loanRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const approved = !!body.approved
  const note = body.note?.trim() || null

  if (body.action === 'hr-decide') {
    if (!roleMatches(role, HR_ROLES)) return NextResponse.json({ error: 'Only HR/Admin can decide at this stage' }, { status: 403 })
    if (loan.status !== 'PENDING_HR') return NextResponse.json({ error: 'This request is not awaiting HR review' }, { status: 409 })
    const updated = await db.loanRequest.update({
      where: { id },
      data: {
        status: approved ? 'PENDING_FINANCE' : 'REJECTED',
        hrDecidedById: session.user.id, hrDecidedAt: new Date(), hrApproved: approved, hrNote: note,
      },
    })
    if (approved) await notifyRoles(db, FINANCE_ROLES, session.user.id, 'LOAN_FINANCE_APPROVAL_NEEDED', 'Loan request needs Finance review', `${loan.employee.fullName} — passed HR review, waiting for Finance review.`)
    else await notifyRequester(db, loan.requestedById, 'Loan request rejected', `${loan.employee.fullName}'s loan request was rejected by HR${note ? `: "${note}"` : '.'}`)
    return NextResponse.json(updated)
  }

  if (body.action === 'finance-decide') {
    if (!roleMatches(role, FINANCE_ROLES)) return NextResponse.json({ error: 'Only Finance/Admin can decide at this stage' }, { status: 403 })
    if (loan.status !== 'PENDING_FINANCE') return NextResponse.json({ error: 'This request is not awaiting Finance review' }, { status: 409 })
    const updated = await db.loanRequest.update({
      where: { id },
      data: {
        status: approved ? 'PENDING_SPECIAL' : 'REJECTED',
        financeDecidedById: session.user.id, financeDecidedAt: new Date(), financeApproved: approved, financeNote: note,
      },
    })
    if (approved) await notifyRoles(db, SPECIAL_ROLES, session.user.id, 'LOAN_SPECIAL_APPROVAL_NEEDED', 'Loan request needs final approval', `${loan.employee.fullName} — passed Finance review, waiting for final (special) approval.`)
    else await notifyRequester(db, loan.requestedById, 'Loan request rejected', `${loan.employee.fullName}'s loan request was rejected by Finance${note ? `: "${note}"` : '.'}`)
    return NextResponse.json(updated)
  }

  if (body.action === 'special-decide') {
    if (!roleMatches(role, SPECIAL_ROLES)) return NextResponse.json({ error: 'Only Admin/Super Admin can give final approval' }, { status: 403 })
    if (loan.status !== 'PENDING_SPECIAL') return NextResponse.json({ error: 'This request is not awaiting final approval' }, { status: 409 })

    if (approved) {
      const year = Number(body.firstDeductionYear)
      const month = Number(body.firstDeductionMonth)
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: 'A valid first deduction month/year is required to approve' }, { status: 400 })
      }

      // Whole-Rupiah installments summing exactly to the principal — remainder from the
      // floor division goes on the last installment rather than scattering cents.
      const base = Math.floor(loan.amount / loan.termMonths)
      const remainder = loan.amount - base * loan.termMonths
      const installments = Array.from({ length: loan.termMonths }, (_, i) => {
        const totalMonthIndex = (month - 1) + i
        return {
          id: crypto.randomUUID(),
          loanRequestId: loan.id,
          employeeId: loan.employeeId,
          installmentNumber: i + 1,
          dueYear: year + Math.floor(totalMonthIndex / 12),
          dueMonth: (totalMonthIndex % 12) + 1,
          amount: i === loan.termMonths - 1 ? base + remainder : base,
        }
      })

      const [updated] = await db.$transaction([
        db.loanRequest.update({
          where: { id },
          data: {
            status: 'APPROVED', firstDeductionYear: year, firstDeductionMonth: month,
            specialDecidedById: session.user.id, specialDecidedAt: new Date(), specialApproved: true, specialNote: note,
          },
        }),
        db.loanInstallment.createMany({ data: installments }),
      ])
      await notifyRequester(db, loan.requestedById, 'Loan request approved', `${loan.employee.fullName}'s loan of Rp ${new Intl.NumberFormat('id-ID').format(loan.amount)} was approved — repayment starts ${month}/${year}.`)
      return NextResponse.json(updated)
    }

    const updated = await db.loanRequest.update({
      where: { id },
      data: { status: 'REJECTED', specialDecidedById: session.user.id, specialDecidedAt: new Date(), specialApproved: false, specialNote: note },
    })
    await notifyRequester(db, loan.requestedById, 'Loan request rejected', `${loan.employee.fullName}'s loan request was rejected${note ? `: "${note}"` : '.'}`)
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
