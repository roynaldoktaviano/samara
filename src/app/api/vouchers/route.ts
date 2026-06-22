import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = session.user.role === 'ADMIN'
  const vouchers = await db.voucher.findMany({
    where: isAdmin ? {} : { isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(vouchers)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const { code, name, description, type, value, minBooking, maxUses, validFrom, validUntil, isActive } = body

  if (!code || !name || !type || value == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['PERCENTAGE', 'FIXED'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  try {
    const voucher = await db.voucher.create({
      data: {
        code: String(code).toUpperCase().trim(),
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
    logActivity({
      userId:   session!.user.id,
      userName: session!.user.name ?? session!.user.email ?? 'Unknown',
      userRole: session!.user.role ?? '',
      action: 'CREATE', entity: 'Voucher', entityId: voucher.id,
      detail: `Add voucher: ${voucher.code}`,
    }).catch(() => {})

    return NextResponse.json(voucher, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Voucher code already exists' }, { status: 409 })
    }
    throw err
  }
}
