import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { sendPushToUsers } from '@/lib/push'
import { buildPayslipEntryDraft, computeTotals, countWeekdaysInMonth, countTripDaysInPeriod } from '@/lib/payroll'

// Bookings in these statuses represent a trip that's actually happening/happened —
// excludes not-yet-confirmed (pending/on_hold) and cancelled bookings from crew Uang Layar.
const TRIP_BOOKING_STATUSES = ['confirmed', 'partially_paid', 'fully_paid', 'completed', 'pending_refund'] as const

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']
// "Head of Finance" has no dedicated role/seniority field in this app — FINANCE_DIRECTOR
// (the combined Purchasing+Finance+HR role) plus Admin/Super Admin is the codebase-native
// stand-in, agreed with the user rather than inventing a new field.
const APPROVER_ROLES = ['FINANCE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN']
const PAY_ROLES = ['FINANCE', 'FINANCE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const period = await db.payrollPeriod.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { fullNameSnap: 'asc' } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      paidBy: { select: { id: true, name: true } },
    },
  })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(period)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json() as { action?: string; approvalNote?: string; rejectionNote?: string }

  const period = await db.payrollPeriod.findUnique({ where: { id } })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'generate-entries') {
    if (period.status !== 'OPEN') return NextResponse.json({ error: 'Entries can only be generated while the period is Open' }, { status: 409 })

    const existingEmployeeIds = new Set(
      (await db.payslipEntry.findMany({ where: { payrollPeriodId: id }, select: { employeeId: true } })).map(e => e.employeeId),
    )
    const employees = await db.employee.findMany({
      where: { isActive: true, id: { notIn: [...existingEmployeeIds] } },
      include: { role: { select: { title: true } }, legalEntity: { select: { name: true } }, location: { select: { name: true } } },
    })
    if (employees.length === 0) return NextResponse.json({ error: 'No new active employees to add — everyone already has an entry' }, { status: 409 })

    // Meal Allowance baseline: Mon–Fri working days in this period's month, minus
    // national holidays that fall on a weekday (shared across everyone), minus each
    // employee's own non-HADIR Attendance Recap days that month (see src/lib/payroll.ts).
    const monthStart = new Date(period.year, period.month - 1, 1)
    const monthEnd = new Date(period.year, period.month, 0, 23, 59, 59, 999)
    const [nonHadirRecords, holidays] = await Promise.all([
      db.attendanceRecord.findMany({
        where: { employeeId: { in: employees.map(e => e.id) }, status: { not: 'HADIR' }, date: { gte: monthStart, lte: monthEnd } },
        select: { employeeId: true, date: true },
      }),
      db.nationalHoliday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } }, select: { date: true } }),
    ])

    // Crew Uang Layar: an employee's work location name doubles as the name of the yacht
    // they're stationed on (e.g. "Bali"/"Bajo" are shore locations, anything else is
    // usually a boat name) — match it against the fleet to find that yacht's trips this
    // period, no separate crew-assignment data needed.
    const yachts = await db.yacht.findMany({ select: { id: true, name: true } })
    const yachtIdByLocationName = new Map(yachts.map(y => [y.name.trim().toLowerCase(), y.id]))
    const yachtIdByEmployeeId = new Map<string, string>()
    for (const emp of employees) {
      const locName = emp.location?.name?.trim().toLowerCase()
      const yachtId = locName ? yachtIdByLocationName.get(locName) : undefined
      if (yachtId) yachtIdByEmployeeId.set(emp.id, yachtId)
    }
    const neededYachtIds = [...new Set(yachtIdByEmployeeId.values())]
    const tripBookings = neededYachtIds.length
      ? await db.booking.findMany({
          where: {
            yachtId: { in: neededYachtIds },
            status: { in: [...TRIP_BOOKING_STATUSES] },
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
          },
          select: { yachtId: true, startDate: true, endDate: true },
        })
      : []
    const bookingRangesByYachtId = new Map<string, { start: Date; end: Date }[]>()
    for (const b of tripBookings) {
      if (!b.yachtId) continue
      const list = bookingRangesByYachtId.get(b.yachtId) ?? []
      list.push({ start: b.startDate, end: b.endDate })
      bookingRangesByYachtId.set(b.yachtId, list)
    }
    const tripDaysByYachtId = new Map<string, number>()
    for (const yachtId of neededYachtIds) {
      tripDaysByYachtId.set(yachtId, countTripDaysInPeriod(bookingRangesByYachtId.get(yachtId) ?? [], monthStart, monthEnd))
    }
    const holidayWeekdays = holidays.filter(h => { const dow = h.date.getDay(); return dow !== 0 && dow !== 6 }).length
    const workingDays = countWeekdaysInMonth(period.year, period.month) - holidayWeekdays
    const nonHadirWorkingDaysByEmployee = new Map<string, number>()
    for (const rec of nonHadirRecords) {
      const dow = rec.date.getDay() // 0 = Sunday, 6 = Saturday — a weekend override never counts against the weekday baseline
      if (dow === 0 || dow === 6) continue
      nonHadirWorkingDaysByEmployee.set(rec.employeeId, (nonHadirWorkingDaysByEmployee.get(rec.employeeId) ?? 0) + 1)
    }

    // Loan deduction: prefill from each employee's earliest still-unlinked PENDING
    // installment due this period or earlier, and tentatively link it to the new entry
    // so Mark Paid can flip it to PAID later (see LoanInstallment.payslipEntryId).
    const duePendingInstallments = await db.loanInstallment.findMany({
      where: { employeeId: { in: employees.map(e => e.id) }, status: 'PENDING', payslipEntryId: null },
      orderBy: [{ dueYear: 'asc' }, { dueMonth: 'asc' }, { installmentNumber: 'asc' }],
    })
    const nextInstallmentByEmployee = new Map<string, (typeof duePendingInstallments)[number]>()
    for (const inst of duePendingInstallments) {
      if (inst.dueYear > period.year || (inst.dueYear === period.year && inst.dueMonth > period.month)) continue
      if (!nextInstallmentByEmployee.has(inst.employeeId)) nextInstallmentByEmployee.set(inst.employeeId, inst)
    }

    const installmentLinks: { installmentId: string; payslipEntryId: string }[] = []
    const rows = employees.map(emp => {
      const yachtId = yachtIdByEmployeeId.get(emp.id)
      const tripDays = yachtId ? (tripDaysByYachtId.get(yachtId) ?? 0) : null
      const draft = buildPayslipEntryDraft(emp, {
        workingDays,
        nonHadirWorkingDays: nonHadirWorkingDaysByEmployee.get(emp.id) ?? 0,
      }, tripDays)
      const nextInstallment = nextInstallmentByEmployee.get(emp.id)
      const entryId = crypto.randomUUID()
      if (nextInstallment) {
        draft.loanDeduction = nextInstallment.amount
        installmentLinks.push({ installmentId: nextInstallment.id, payslipEntryId: entryId })
      }
      const totals = computeTotals(draft)
      return {
        id: entryId,
        payrollPeriodId: id,
        employeeId: emp.id,
        employeeNumberSnap: emp.employeeNumber,
        fullNameSnap: emp.fullName,
        positionSnap: emp.role?.title ?? null,
        companyNameSnap: emp.legalEntity?.name ?? null,
        npwpSnap: emp.npwp,
        nikSnap: emp.nikPassport,
        bankNameSnap: emp.bankName,
        bankAccountNumberSnap: emp.bankAccountNumber,
        bankAccountNameSnap: emp.bankAccountName,
        leaveBalanceSnap: emp.leaveBalance,
        joinDateSnap: emp.joinDate,
        workLocationSnap: emp.location?.name ?? null,
        ...draft,
        otherIncomeSnap: draft.otherIncomeSnap as unknown as Prisma.InputJsonValue,
        ...totals,
      }
    })
    await db.payslipEntry.createMany({ data: rows })
    if (installmentLinks.length) {
      await db.$transaction(installmentLinks.map(l =>
        db.loanInstallment.update({ where: { id: l.installmentId }, data: { payslipEntryId: l.payslipEntryId } }),
      ))
    }
    const updated = await db.payrollPeriod.findUnique({ where: { id }, include: { entries: { orderBy: { fullNameSnap: 'asc' } } } })
    return NextResponse.json(updated)
  }

  if (body.action === 'submit') {
    if (period.status !== 'OPEN') return NextResponse.json({ error: 'Only an Open period can be submitted' }, { status: 409 })
    const entryCount = await db.payslipEntry.count({ where: { payrollPeriodId: id } })
    if (entryCount === 0) return NextResponse.json({ error: 'Generate at least one entry before submitting' }, { status: 400 })

    const updated = await db.payrollPeriod.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedById: session.user.id, submittedAt: new Date() },
    })

    const approvers = await db.user.findMany({ where: { role: { in: APPROVER_ROLES as never[] }, id: { not: session.user.id } }, select: { id: true } })
    if (approvers.length) {
      const title = 'Payroll needs Head of Finance approval'
      const notifBody = `Payroll ${period.month}/${period.year} — submitted, waiting for approval.`
      await db.notification.createMany({ data: approvers.map(u => ({ userId: u.id, type: 'PAYROLL_APPROVAL_NEEDED', title, body: notifBody })) }).catch(() => {})
      sendPushToUsers(db, approvers.map(u => u.id), { title, body: notifBody }).catch(() => {})
    }
    return NextResponse.json(updated)
  }

  if (body.action === 'approve') {
    if (!roleMatches(role, APPROVER_ROLES)) return NextResponse.json({ error: 'Only Head of Finance (Finance Director/Admin/Super Admin) can approve' }, { status: 403 })
    if (period.status !== 'SUBMITTED') return NextResponse.json({ error: 'This period is not awaiting approval' }, { status: 409 })
    const updated = await db.payrollPeriod.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: session.user.id, approvedAt: new Date(), approvalNote: body.approvalNote?.trim() || null },
    })
    return NextResponse.json(updated)
  }

  if (body.action === 'reject') {
    if (!roleMatches(role, APPROVER_ROLES)) return NextResponse.json({ error: 'Only Head of Finance (Finance Director/Admin/Super Admin) can reject' }, { status: 403 })
    if (period.status !== 'SUBMITTED') return NextResponse.json({ error: 'This period is not awaiting approval' }, { status: 409 })
    const updated = await db.payrollPeriod.update({
      where: { id },
      data: { status: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), rejectionNote: body.rejectionNote?.trim() || null },
    })
    if (period.submittedById) {
      const title = 'Payroll rejected'
      const notifBody = `Payroll ${period.month}/${period.year} was rejected${body.rejectionNote ? `: "${body.rejectionNote.trim()}"` : '.'}`
      await db.notification.create({ data: { userId: period.submittedById, type: 'PAYROLL_REJECTED', title, body: notifBody } }).catch(() => {})
      sendPushToUsers(db, [period.submittedById], { title, body: notifBody }).catch(() => {})
    }
    return NextResponse.json(updated)
  }

  if (body.action === 'reopen') {
    if (period.status !== 'REJECTED') return NextResponse.json({ error: 'Only a rejected period can be reopened' }, { status: 409 })
    // Nothing was actually paid — free any tentatively-linked loan installments so
    // they're eligible to be pulled again next time entries are generated.
    const entryIds = (await db.payslipEntry.findMany({ where: { payrollPeriodId: id }, select: { id: true } })).map(e => e.id)
    if (entryIds.length) {
      await db.loanInstallment.updateMany({ where: { payslipEntryId: { in: entryIds }, status: 'PENDING' }, data: { payslipEntryId: null } })
    }
    const updated = await db.payrollPeriod.update({
      where: { id },
      data: {
        status: 'OPEN',
        submittedById: null, submittedAt: null,
        rejectedById: null, rejectedAt: null, rejectionNote: null,
      },
    })
    return NextResponse.json(updated)
  }

  if (body.action === 'mark-paid') {
    if (!roleMatches(role, PAY_ROLES)) return NextResponse.json({ error: 'Only Finance can mark payroll as paid' }, { status: 403 })
    if (period.status !== 'APPROVED') return NextResponse.json({ error: 'Only an approved period can be marked paid' }, { status: 409 })
    const updated = await db.payrollPeriod.update({
      where: { id },
      data: { status: 'PAID', paidById: session.user.id, paidAt: new Date() },
    })
    // Firm up any tentatively-linked loan installments now that this period is really paid.
    const entries = await db.payslipEntry.findMany({ where: { payrollPeriodId: id }, select: { id: true, loanDeduction: true } })
    const linkedInstallments = await db.loanInstallment.findMany({ where: { payslipEntryId: { in: entries.map(e => e.id) } } })
    if (linkedInstallments.length) {
      const loanDeductionByEntryId = new Map(entries.map(e => [e.id, e.loanDeduction]))
      await db.$transaction(linkedInstallments.map(inst => db.loanInstallment.update({
        where: { id: inst.id },
        data: { status: 'PAID', paidAt: new Date(), paidAmount: loanDeductionByEntryId.get(inst.payslipEntryId!) ?? inst.amount },
      })))
    }
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
