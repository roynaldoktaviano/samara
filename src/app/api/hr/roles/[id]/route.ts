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
  const { title, locationId, isActive } = await req.json()

  if (title !== undefined) {
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    const dup = await db.employeeRole.findFirst({ where: { title: { equals: title.trim(), mode: 'insensitive' }, NOT: { id } } })
    if (dup) return NextResponse.json({ error: `Role "${title.trim()}" already exists` }, { status: 409 })
  }

  const updated = await db.employeeRole.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(locationId !== undefined && { locationId: locationId || null }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
    include: { location: { select: { id: true, name: true } } },
  })
  // Every employee/candidate FK-referencing this role reads the title live off this
  // same row — renaming here is all that's needed for it to show up everywhere.
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [employeeCount, candidateCount] = await Promise.all([
    db.employee.count({ where: { roleId: id } }),
    db.candidate.count({ where: { appliedRoleId: id } }),
  ])
  if (employeeCount > 0 || candidateCount > 0) {
    return NextResponse.json({ error: `Cannot delete — still assigned to ${employeeCount} employee(s) and ${candidateCount} candidate(s). Deactivate it instead.` }, { status: 409 })
  }

  await db.compensationBand.deleteMany({ where: { roleId: id } })
  await db.employeeRole.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
