import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const holidays = await db.nationalHoliday.findMany({
    orderBy: { date: 'desc' },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json(holidays)
}

// Accepts a range — startDate/endDate (inclusive), so a multi-day holiday like Idul Fitri
// can be added in one go instead of one date at a time. A single day is just startDate
// === endDate. Dates that already have a holiday are skipped rather than failing the
// whole batch (createMany + skipDuplicates, backed by the @unique date constraint).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { startDate, endDate, name } = await req.json()
  if (!startDate || !endDate || !name?.trim()) return NextResponse.json({ error: 'Start date, end date, and name are required' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 })

  const rows: { id: string; date: Date; name: string; createdById: string }[] = []
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    rows.push({ id: crypto.randomUUID(), date: new Date(d), name: name.trim(), createdById: session.user.id })
  }

  const result = await db.nationalHoliday.createMany({ data: rows, skipDuplicates: true })
  const skipped = rows.length - result.count
  return NextResponse.json({ created: result.count, skipped }, { status: 201 })
}
