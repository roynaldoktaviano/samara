import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/activity'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { name, email, role, password } = await req.json()

  const data: Record<string, unknown> = {}
  if (name     !== undefined) data.name     = name || null
  if (email    !== undefined) data.email    = email
  if (role     !== undefined) data.role     = role
  if (password)               data.password = await bcrypt.hash(password, 10)

  try {
    const user = await db.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })

    logActivity({
      userId:   session!.user.id,
      userName: session!.user.name ?? session!.user.email ?? 'Unknown',
      userRole: session!.user.role ?? '',
      action: 'UPDATE', entity: 'User', entityId: user.id,
      detail: `Update user: ${user.name ?? user.email}`,
    }).catch(() => {})

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
  if (session?.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id }, select: { name: true, email: true } })
  await db.user.delete({ where: { id } })

  logActivity({
    userId:   session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: session.user.role ?? '',
    action: 'DELETE', entity: 'User', entityId: id,
    detail: `Hapus user: ${target?.name ?? target?.email ?? id}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
