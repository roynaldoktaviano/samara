import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']
const VALID_STATUSES = ['HADIR', 'IZIN', 'SAKIT', 'CUTI', 'ALPHA', 'LIBUR']

const ymd = (d: Date) => d.toISOString().split('T')[0]

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD&department=
// Returns a sparse map — any (employeeId, date) missing from `records` is implicitly
// HADIR (present), the default the whole grid assumes unless HR (or an approved Leave
// Request) explicitly set something else.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const locationId = searchParams.get('locationId')
  if (!start || !end) return NextResponse.json({ error: 'start and end are required' }, { status: 400 })

  const startDate = new Date(start)
  const endDate = new Date(`${end}T23:59:59.999Z`)

  const employees = await db.employee.findMany({
    where: { isActive: true, ...(locationId ? { locationId } : {}) },
    select: { id: true, fullName: true, employeeNumber: true, department: true },
    orderBy: { fullName: 'asc' },
  })

  const days: string[] = []
  for (const d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) days.push(ymd(d))

  const [attendanceRecords, holidays] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { employeeId: { in: employees.map(e => e.id) }, date: { gte: startDate, lte: endDate } },
      select: { employeeId: true, date: true, status: true, note: true, leaveRequestId: true },
    }),
    db.nationalHoliday.findMany({ where: { date: { gte: startDate, lte: endDate } }, select: { date: true, name: true } }),
  ])

  const records: Record<string, Record<string, { status: string; note: string | null; leaveRequestId: string | null }>> = {}
  for (const rec of attendanceRecords) {
    const key = ymd(rec.date)
    records[rec.employeeId] ??= {}
    records[rec.employeeId][key] = { status: rec.status, note: rec.note, leaveRequestId: rec.leaveRequestId }
  }

  // A shared calendar, not per-employee rows — the grid applies this as a LIBUR default
  // (same idea as a weekend) for any date not already overridden per-employee above.
  const holidayMap: Record<string, string> = {}
  for (const h of holidays) holidayMap[ymd(h.date)] = h.name

  return NextResponse.json({ employees, days, records, holidays: holidayMap })
}

// PATCH { employeeId, dates: string[], status, note? }
// One call covers both a single-cell edit (dates.length === 1) and "Bulk Edit" (a status
// applied across several dates at once) — upserts one AttendanceRecord per date.
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await request.json() as { employeeId?: string; dates?: string[]; status?: string; note?: string }
  const { employeeId, dates, status, note } = body
  if (!employeeId || !Array.isArray(dates) || dates.length === 0) return NextResponse.json({ error: 'employeeId and at least one date are required' }, { status: 400 })
  if (!status || !VALID_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  await Promise.all(dates.map(dateStr => {
    const date = new Date(dateStr)
    return db.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { id: crypto.randomUUID(), employeeId, date, status: status as never, note: note?.trim() || null, setById: session.user.id },
      update: { status: status as never, note: note?.trim() || null, setById: session.user.id, leaveRequestId: null },
    })
  }))

  return NextResponse.json({ ok: true })
}
