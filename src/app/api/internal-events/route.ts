import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

// Matches the Calendar page's own `canEdit` gate for creating a Booking — internal
// events live on the same calendar, so anyone who can add a booking can add one.
const ALLOWED = ['ADMIN', 'SALES']
const TYPES = ['DOCKING', 'CROSSING', 'OVERHAUL', 'COMPANY_NEED']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const events = await db.internalEvent.findMany({
    include: { yacht: { select: { id: true, name: true } } },
    orderBy: { startDate: 'asc' },
  })
  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { type, title, notes, startDate, endDate, yachtId } = await req.json()

  if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'Start and end date are required' }, { status: 400 })
  if (new Date(endDate) < new Date(startDate)) return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })

  if (yachtId) {
    const yacht = await db.yacht.findUnique({ where: { id: yachtId }, select: { id: true } })
    if (!yacht) return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })
  }

  const created = await db.internalEvent.create({
    data: {
      id: crypto.randomUUID(),
      type, title: title.trim(), notes: notes?.trim() || null,
      startDate: new Date(startDate), endDate: new Date(endDate),
      yachtId: yachtId || null,
      createdById: session.user.id,
    },
    include: { yacht: { select: { id: true, name: true } } },
  })
  return NextResponse.json(created, { status: 201 })
}
