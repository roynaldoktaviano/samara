import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  const body = await request.json()
  const { code, bookingAmount } = body

  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })

  const voucher = await db.voucher.findUnique({
    where: { code: String(code).toUpperCase().trim() },
  })

  if (!voucher) return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
  if (!voucher.isActive) return NextResponse.json({ error: 'Voucher is not active' }, { status: 400 })

  const now = new Date()
  if (voucher.validFrom && now < voucher.validFrom) {
    return NextResponse.json({ error: 'Voucher is not valid yet' }, { status: 400 })
  }
  if (voucher.validUntil && now > voucher.validUntil) {
    return NextResponse.json({ error: 'Voucher has expired' }, { status: 400 })
  }
  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    return NextResponse.json({ error: 'Voucher usage limit reached' }, { status: 400 })
  }
  if (voucher.minBooking != null && bookingAmount != null && parseFloat(bookingAmount) < voucher.minBooking) {
    return NextResponse.json({
      error: `Minimum booking amount is $${voucher.minBooking.toLocaleString()}`,
    }, { status: 400 })
  }

  return NextResponse.json({
    id: voucher.id,
    code: voucher.code,
    name: voucher.name,
    type: voucher.type,
    value: voucher.value,
  })
}
