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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const candidate = await db.candidate.findUnique({ where: { id } })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (candidate.status !== 'HIRED') return NextResponse.json({ error: 'Only hired candidates can be converted to an employee' }, { status: 400 })
  if (candidate.convertedEmployeeId) return NextResponse.json({ error: 'This candidate has already been converted to an employee' }, { status: 409 })

  const employeeNumber = await generateEmployeeNumber(db)
  const employee = await db.employee.create({
    data: {
      id: crypto.randomUUID(),
      employeeNumber,
      fullName: candidate.fullName,
      roleId: candidate.appliedRoleId,
      phone: candidate.phone,
      personalEmail: candidate.email,
      employmentStatus: 'Probation',
      joinDate: new Date(),
      updatedAt: new Date(),
    },
  })

  const updated = await db.candidate.update({
    where: { id },
    data: { convertedEmployeeId: employee.id },
    include: { appliedRole: { select: { id: true, title: true } } },
  })

  return NextResponse.json({ candidate: updated, employee })
}
