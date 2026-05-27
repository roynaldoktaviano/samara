import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string })?.role ?? ''
    if (!['ADMIN', 'FINANCE', 'SUPER_ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    const { name, bankAddress, swiftCode, beneficiaryName, idrAccount, usdAccount, address, isActive } = body
    if (!name) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
    const bank = await db.bank.update({
      where: { id },
      data: { name, bankAddress, swiftCode, beneficiaryName, idrAccount, usdAccount, address, isActive },
    })
    return NextResponse.json(bank)
  } catch {
    return NextResponse.json({ error: 'Failed to update bank' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string })?.role ?? ''
    if (!['ADMIN', 'FINANCE', 'SUPER_ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await db.bank.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete bank' }, { status: 500 })
  }
}
