import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { computeTotals, OtherIncomeItem } from '@/lib/payroll'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

// Every earning/deduction figure a PATCH may override — kept in one place so the route
// and the total-recompute step agree on exactly what's editable. otherIncomeSnap is
// handled separately below since it's an array, not a plain number.
const EDITABLE_FIELDS = [
  'basicSalary', 'functionAllowance', 'mealAllowance', 'uangLayar', 'commission', 'thr',
  'bpjsJkkCompany', 'bpjsJkmCompany', 'bpjsJhtCompany', 'bpjsJpCompany', 'bpjsKesehatanCompany',
  'bpjsJhtEmployee', 'bpjsJpEmployee', 'bpjsKesehatanEmployee', 'pph21', 'loanDeduction',
] as const

export async function GET(_: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const entry = await db.payslipEntry.findUnique({
    where: { id: entryId },
    include: { payrollPeriod: true, employee: { select: { id: true, fullName: true } } },
  })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(entry)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const entry = await db.payslipEntry.findUnique({ where: { id: entryId }, include: { payrollPeriod: { select: { status: true } } } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.payrollPeriod.status !== 'OPEN') return NextResponse.json({ error: 'This payroll period is no longer open for editing' }, { status: 409 })

  const body = await req.json() as Record<string, unknown>
  const data: Record<string, number> = {}
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      const num = Number(body[field])
      if (Number.isFinite(num)) data[field] = num
    }
  }

  let otherIncomeSnap: OtherIncomeItem[] | undefined
  let otherIncomeTotal: number | undefined
  if (Array.isArray(body.otherIncomeSnap)) {
    otherIncomeSnap = (body.otherIncomeSnap as OtherIncomeItem[]).map(i => ({
      id: String(i.id ?? crypto.randomUUID()),
      name: String(i.name ?? '').trim(),
      description: String(i.description ?? '').trim(),
      amount: Number(i.amount) || 0,
    }))
    otherIncomeTotal = otherIncomeSnap.reduce((s, i) => s + i.amount, 0)
  }

  if (Object.keys(data).length === 0 && otherIncomeSnap === undefined) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const merged = { ...entry, ...data, ...(otherIncomeTotal !== undefined && { otherIncomeTotal }) }
  const totals = computeTotals(merged)

  const updated = await db.payslipEntry.update({
    where: { id: entryId },
    data: {
      ...data,
      ...(otherIncomeSnap !== undefined && { otherIncomeSnap: otherIncomeSnap as unknown as Prisma.InputJsonValue, otherIncomeTotal }),
      ...totals,
      isManuallyEdited: true,
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const entry = await db.payslipEntry.findUnique({ where: { id: entryId }, include: { payrollPeriod: { select: { status: true } } } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.payrollPeriod.status !== 'OPEN') return NextResponse.json({ error: 'This payroll period is no longer open for editing' }, { status: 409 })

  await db.payslipEntry.delete({ where: { id: entryId } })
  return NextResponse.json({ ok: true })
}
