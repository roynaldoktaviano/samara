import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SALES']
const TYPES = ['DOCKING', 'CROSSING', 'OVERHAUL', 'COMPANY_NEED']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { type, title, notes, startDate, endDate, yachtId, internalOnly } = await req.json()

  if (type !== undefined && !TYPES.includes(type)) return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  if (title !== undefined && !title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if ((startDate !== undefined || endDate !== undefined) && new Date(endDate) < new Date(startDate)) {
    return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })
  }
  if (yachtId) {
    const yacht = await db.yacht.findUnique({ where: { id: yachtId }, select: { id: true } })
    if (!yacht) return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })
  }

  const updated = await db.internalEvent.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(title !== undefined && { title: title.trim() }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(yachtId !== undefined && { yachtId: yachtId || null }),
      ...(internalOnly !== undefined && { internalOnly: internalOnly !== false }),
    },
    include: { yacht: { select: { id: true, name: true } } },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  await db.internalEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
