import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { fullName, employeeNumber, legalEntityId, locationId, department, roleId, isActive, resignedAt, resignStatus, resignReason, gender, employmentStatus, leaveBalance, joinDate, managerId, userId } = await req.json()

  if (employeeNumber) {
    const dup = await db.employee.findFirst({ where: { employeeNumber: employeeNumber.trim(), NOT: { id } } })
    if (dup) return NextResponse.json({ error: `Employee number "${employeeNumber}" already exists` }, { status: 409 })
  }

  if (managerId !== undefined && managerId === id) {
    return NextResponse.json({ error: 'An employee cannot be their own manager' }, { status: 400 })
  }

  try {
    const employee = await db.employee.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName: fullName.trim() }),
        ...(employeeNumber !== undefined && { employeeNumber: employeeNumber.trim() }),
        ...(department !== undefined && { department: department?.trim() || null }),
        ...(legalEntityId !== undefined && { legalEntityId: legalEntityId || null }),
        ...(locationId !== undefined && { locationId: locationId || null }),
        ...(roleId !== undefined && { roleId: roleId || null }),
        ...(gender !== undefined && { gender: gender?.trim() || null }),
        ...(employmentStatus !== undefined && { employmentStatus: employmentStatus?.trim() || null }),
        ...(leaveBalance !== undefined && { leaveBalance: leaveBalance !== '' ? parseInt(leaveBalance) : null }),
        ...(joinDate !== undefined && { joinDate: joinDate ? new Date(joinDate) : null }),
        ...(managerId !== undefined && { managerId: managerId || null }),
        ...(userId !== undefined && { userId: userId || null }),
        ...(isActive !== undefined && {
          isActive,
          // Reactivating clears any prior resignation record; deactivating records it from the payload.
          resignedAt: isActive ? null : (resignedAt ? new Date(resignedAt) : new Date()),
          resignStatus: isActive ? null : (resignStatus || null),
          resignReason: isActive ? null : (resignReason?.trim() || null),
        }),
      },
      include: {
        legalEntity: true,
        location: { select: { id: true, name: true, type: true } },
        role: true,
        manager: { select: { id: true, fullName: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    return NextResponse.json(employee)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'This login account is already linked to another employee' }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.employee.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
