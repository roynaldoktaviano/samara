import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await request.json()
  const { code, name, description, type, value, minBooking, maxUses, validFrom, validUntil, isActive } = body

  try {
    const voucher = await db.voucher.update({
      where: { id },
      data: {
        code: code ? String(code).toUpperCase().trim() : undefined,
        name,
        description: description || null,
        type,
        value: parseFloat(value),
        minBooking: minBooking != null ? parseFloat(minBooking) : null,
        maxUses: maxUses != null ? parseInt(maxUses) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: isActive !== false,
      },
    })
    return NextResponse.json(voucher)
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Voucher code already exists' }, { status: 409 })
    }
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }
    throw err
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await request.json()
  const voucher = await db.voucher.update({ where: { id }, data: body })
  return NextResponse.json(voucher)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  await db.voucher.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
