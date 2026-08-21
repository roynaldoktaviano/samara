import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN']
const TYPES = ['PERCENT', 'FIXED']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, type, value, yachtId, startDate, endDate, isActive } = body as {
    name?: string; type?: string; value?: number; yachtId?: string | null; startDate?: string | null; endDate?: string | null; isActive?: boolean
  }

  if (name !== undefined && !name.trim()) return NextResponse.json({ error: 'Discount name is required' }, { status: 400 })
  if (type !== undefined && !TYPES.includes(type)) return NextResponse.json({ error: 'Type must be PERCENT or FIXED' }, { status: 400 })
  if (value !== undefined && Number(value) <= 0) return NextResponse.json({ error: 'Please set a value greater than 0' }, { status: 400 })
  if (type === 'PERCENT' && value !== undefined && Number(value) > 100) {
    return NextResponse.json({ error: 'Percent discount cannot exceed 100' }, { status: 400 })
  }

  const discount = await db.posDiscount.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(value !== undefined && { value: Number(value) }),
      ...(yachtId !== undefined && { yachtId: yachtId || null }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { yacht: { select: { id: true, name: true } } },
  })
  return NextResponse.json(discount)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  await db.posDiscount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
