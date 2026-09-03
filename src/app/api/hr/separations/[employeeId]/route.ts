import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      role: { select: { title: true } },
      location: { select: { name: true } },
      assets: { orderBy: { assignedDate: 'desc' } },
      separation: {
        include: {
          clearanceCompletedBy: { select: { id: true, name: true } },
          paklaringIssuedBy: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  return NextResponse.json(employee)
}

// Upserts this employee's separation record — used for the "clearance complete" toggle
// and its notes. Paklaring issuance is handled separately by the paklaring sub-route.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  const userId = session?.user?.id
  if (!userId || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { clearanceCompleted, clearanceNotes } = await req.json()

  const separation = await db.employeeSeparation.upsert({
    where: { employeeId },
    create: {
      employeeId,
      clearanceCompletedAt: clearanceCompleted ? new Date() : null,
      clearanceCompletedById: clearanceCompleted ? userId : null,
      clearanceNotes: clearanceNotes?.trim() || null,
    },
    update: {
      ...(clearanceCompleted !== undefined && {
        clearanceCompletedAt: clearanceCompleted ? new Date() : null,
        clearanceCompletedById: clearanceCompleted ? userId : null,
      }),
      ...(clearanceNotes !== undefined && { clearanceNotes: clearanceNotes?.trim() || null }),
    },
  })
  return NextResponse.json(separation)
}
