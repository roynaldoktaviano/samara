import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'
import { computeTotals } from '@/lib/payroll'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE']

// Every earning/deduction figure a PATCH may override — kept in one place so the route
// and the total-recompute step agree on exactly what's editable.
const EDITABLE_FIELDS = [
  'basicSalary', 'functionAllowance', 'mealAllowance', 'uangLayar', 'commission', 'thr', 'benefitBpjsAndTax',
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
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })

  // benefitBpjsAndTax is its own independently-editable figure now (sourced from
  // Employee.benefit at generation time) — not recomputed from the BPJS fields below,
  // which are tracked separately for the employer's own cost record.
  const merged = { ...entry, ...data }
  const totals = computeTotals(merged)

  const updated = await db.payslipEntry.update({
    where: { id: entryId },
    data: { ...data, ...totals, isManuallyEdited: true },
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
