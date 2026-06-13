import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, currentPassword, newPassword } = await request.json()

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const data: { name?: string; password?: string } = {}

  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    data.name = name.trim()
  }

  if (newPassword) {
    if (!currentPassword) return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    if (newPassword.length < 6) return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    data.password = await bcrypt.hash(newPassword, 12)
  }

  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  await db.user.update({ where: { id: session.user.id }, data })

  return NextResponse.json({ ok: true, name: data.name ?? user.name })
}
