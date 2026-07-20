import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const accounts = await db.reimburseAccount.findMany({ orderBy: { accountHolderName: 'asc' } })
  return NextResponse.json(accounts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { accountHolderName, bankName, accountNumber } = await req.json()
  if (!accountHolderName?.trim()) return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })
  if (!bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
  if (!accountNumber?.trim()) return NextResponse.json({ error: 'Account number is required' }, { status: 400 })

  const existing = await db.reimburseAccount.findFirst({
    where: { bankName: { equals: bankName.trim(), mode: 'insensitive' }, accountNumber: accountNumber.trim() },
  })
  if (existing) return NextResponse.json(existing)

  const account = await db.reimburseAccount.create({
    data: { accountHolderName: accountHolderName.trim(), bankName: bankName.trim(), accountNumber: accountNumber.trim() },
  })
  return NextResponse.json(account, { status: 201 })
}
