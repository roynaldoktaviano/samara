import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// Fetches (issuing on first call) the paklaring for one employee's separation. The number
// is assigned once and reused on every reprint — see EmployeeSeparation.paklaringNumber.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const userId = session?.user?.id
  if (!userId || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      role: { select: { title: true } },
      location: { select: { name: true } },
      separation: true,
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!employee.resignedAt) return NextResponse.json({ error: 'This employee has no resignation date on file' }, { status: 400 })

  let separation = employee.separation
  if (!separation?.paklaringNumber) {
    const issuedCount = await db.employeeSeparation.count({ where: { paklaringNumber: { not: null } } })
    const now = new Date()
    const paklaringNumber = `${String(issuedCount + 1).padStart(3, '0')}/HR-SKK/${ROMAN_MONTHS[now.getMonth()]}/${now.getFullYear()}`
    separation = await db.employeeSeparation.upsert({
      where: { employeeId },
      create: { employeeId, paklaringNumber, paklaringIssuedAt: now, paklaringIssuedById: userId },
      update: { paklaringNumber, paklaringIssuedAt: now, paklaringIssuedById: userId },
    })
  }

  return NextResponse.json({
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    nikPassport: employee.nikPassport,
    placeOfBirth: employee.placeOfBirth,
    birthDate: employee.birthDate,
    position: employee.role?.title ?? null,
    department: employee.department,
    location: employee.location?.name ?? null,
    joinDate: employee.joinDate,
    resignedAt: employee.resignedAt,
    resignStatus: employee.resignStatus,
    paklaringNumber: separation.paklaringNumber,
    paklaringIssuedAt: separation.paklaringIssuedAt,
  })
}
