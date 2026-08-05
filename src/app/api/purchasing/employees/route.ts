import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employees = await db.employee.findMany({
    where: { isActive: true },
    select: {
      id: true, fullName: true, employeeNumber: true, department: true,
      location: { select: { name: true } },
      role: { select: { title: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  return NextResponse.json(employees.map(e => ({
    id: e.id,
    fullName: e.fullName,
    employeeNumber: e.employeeNumber,
    department: e.department,
    office: e.location?.name ?? null,
    role: e.role?.title ?? null,
  })))
}
