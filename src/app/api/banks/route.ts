import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET() {
  const db = await getDb()
  try {
    const banks = await db.bank.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json(banks)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch banks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string })?.role ?? ''
    if (!['ADMIN', 'FINANCE', 'SUPER_ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
    const { name, bankAddress, swiftCode, beneficiaryName, idrAccount, usdAccount, address } = body
    if (!name) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
    const bank = await db.bank.create({
      data: { name, bankAddress, swiftCode, beneficiaryName, idrAccount, usdAccount, address },
    })
    return NextResponse.json(bank, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create bank' }, { status: 500 })
  }
}
