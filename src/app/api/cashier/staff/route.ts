import { NextRequest, NextResponse } from 'next/server'
import { resolveCashierSession } from '@/lib/cashier-access'
import { withRetry } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await resolveCashierSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = session

  const { searchParams } = new URL(request.url)
  // The terminal is locked to the yacht its PIN unlocked.
  const yachtId = session.yachtId
  if (searchParams.get('yachtId') && searchParams.get('yachtId') !== yachtId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const yacht = await withRetry(db, () => db.yacht.findUnique({ where: { id: yachtId }, select: { name: true } }))
  if (!yacht) return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })

  // Employee.locationId points at an EmployeeWorkLocation (HR), not a StockLocation — a
  // yacht's crew are the employees whose work location name matches the yacht's name
  // (the same crew↔yacht link payroll and yachtCrewWhere in src/lib/purchasing/yachtScope.ts use).
  const employees = await withRetry(db, () => db.employee.findMany({
    where: { isActive: true, location: { name: { equals: yacht.name.trim(), mode: 'insensitive' } } },
    select: { id: true, fullName: true, department: true },
    orderBy: { fullName: 'asc' },
  }))

  return NextResponse.json(employees)
}
