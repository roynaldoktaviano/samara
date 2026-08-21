import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']
const TYPES = ['PERCENT', 'FIXED']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(req.url)
  const yachtId = searchParams.get('yachtId')
  const where = yachtId === 'global' ? { yachtId: null } : yachtId ? { OR: [{ yachtId }, { yachtId: null }] } : {}

  const discounts = await db.posDiscount.findMany({
    where,
    include: { yacht: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }],
  })
  return NextResponse.json(discounts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, type, value, yachtId, startDate, endDate } = body as {
    name?: string; type?: string; value?: number; yachtId?: string | null; startDate?: string; endDate?: string
  }

  if (!name?.trim()) return NextResponse.json({ error: 'Discount name is required' }, { status: 400 })
  if (!type || !TYPES.includes(type)) return NextResponse.json({ error: 'Type must be PERCENT or FIXED' }, { status: 400 })
  if (value === undefined || value === null || Number(value) <= 0) return NextResponse.json({ error: 'Please set a value greater than 0' }, { status: 400 })
  if (type === 'PERCENT' && Number(value) > 100) return NextResponse.json({ error: 'Percent discount cannot exceed 100' }, { status: 400 })

  const discount = await db.posDiscount.create({
    data: {
      name: name.trim(),
      type,
      value: Number(value),
      yachtId: yachtId || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: { yacht: { select: { id: true, name: true } } },
  })
  return NextResponse.json(discount, { status: 201 })
}
