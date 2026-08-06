import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/activity'

const ALLOWED_ROLES = ['SALES', 'FINANCE', 'MARKETING', 'ADMIN', 'PURCHASING', 'WAREHOUSE', 'HR', 'SALES_MARKETING', 'FINANCE_DIRECTOR']

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'SUPER_ADMIN'].includes(session?.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { name, email, role, password, employeeId } = await req.json()

  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Cannot assign SUPER_ADMIN role through this interface' }, { status: 403 })
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (name     !== undefined) data.name     = name || null
  if (email    !== undefined) data.email    = email.toLowerCase().trim()
  if (role     !== undefined) data.role     = role
  if (password)               data.password = await bcrypt.hash(password, 12)

  try {
    const db = await getDb(session)

    if (employeeId !== undefined) {
      // Unlink whichever employee currently holds this login (if any) before
      // attaching it elsewhere — Employee.userId is unique, so leaving the old
      // link in place would make the new one fail.
      await db.employee.updateMany({ where: { userId: id }, data: { userId: null } })
      if (employeeId) {
        await db.employee.update({ where: { id: employeeId }, data: { userId: id } })
      }
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        employeeProfile: { select: { id: true, fullName: true, employeeNumber: true } },
      },
    })

    logActivity({
      userId:   session!.user.id,
      userName: session!.user.name ?? session!.user.email ?? 'Unknown',
      userRole: session!.user.role ?? '',
      action: 'UPDATE', entity: 'User', entityId: user.id,
      detail: `Update user: ${user.name ?? user.email}`,
    }, db).catch(() => {})

    return NextResponse.json(user)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'P2002') return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    if (code === 'P2025') return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'SUPER_ADMIN'].includes(session?.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === session!.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const db = await getDb(session!)
  const target = await db.user.findUnique({ where: { id }, select: { name: true, email: true } })
  await db.user.delete({ where: { id } })

  logActivity({
    userId:   session!.user.id,
    userName: session!.user.name ?? session!.user.email ?? 'Unknown',
    userRole: session!.user.role ?? '',
    action: 'DELETE', entity: 'User', entityId: id,
    detail: `Hapus user: ${target?.name ?? target?.email ?? id}`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true })
}
