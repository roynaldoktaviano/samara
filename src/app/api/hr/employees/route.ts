import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

async function generateEmployeeNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const prefix = 'EMP-'
  const last = await db.employee.findFirst({ where: { employeeNumber: { startsWith: prefix } }, orderBy: { employeeNumber: 'desc' }, select: { employeeNumber: true } })
  const seq = last ? (parseInt(last.employeeNumber.slice(prefix.length)) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const employees = await db.employee.findMany({
    orderBy: { fullName: 'asc' },
    include: { legalEntity: true, location: { select: { id: true, name: true, type: true } }, role: true },
  })
  return NextResponse.json(employees)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { fullName, employeeNumber, legalEntityId, locationId, department, roleId, gender, employmentStatus, leaveBalance, joinDate } = await req.json()
  if (!fullName?.trim()) return NextResponse.json({ error: 'Full name is required' }, { status: 400 })

  const number = employeeNumber?.trim() || await generateEmployeeNumber(db)
  const existing = await db.employee.findUnique({ where: { employeeNumber: number } })
  if (existing) return NextResponse.json({ error: `Employee number "${number}" already exists` }, { status: 409 })

  const employee = await db.employee.create({
    data: {
      id: crypto.randomUUID(),
      employeeNumber: number,
      fullName: fullName.trim(),
      department: department?.trim() || null,
      legalEntityId: legalEntityId || null,
      locationId: locationId || null,
      roleId: roleId || null,
      gender: gender?.trim() || null,
      employmentStatus: employmentStatus?.trim() || null,
      leaveBalance: leaveBalance !== undefined && leaveBalance !== '' ? parseInt(leaveBalance) : null,
      joinDate: joinDate ? new Date(joinDate) : null,
      updatedAt: new Date(),
    },
    include: { legalEntity: true, location: { select: { id: true, name: true, type: true } }, role: true },
  })
  return NextResponse.json(employee, { status: 201 })
}
