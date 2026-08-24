import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'HR']

// Every existing consumer (Employees form/filter, request-order pickers, …) relies on
// this defaulting to active-only, so retired roles don't show up as selectable. The
// Roles & Compensation management screen is the one place that needs to see inactive
// roles too (to reactivate them), via ?all=1.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const includeInactive = req.nextUrl.searchParams.get('all') === '1'
  const roles = await db.employeeRole.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { title: 'asc' },
    include: { location: { select: { id: true, name: true } } },
  })
  return NextResponse.json(roles)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const { title, locationId } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const dup = await db.employeeRole.findFirst({ where: { title: { equals: title.trim(), mode: 'insensitive' } } })
  if (dup) return NextResponse.json({ error: `Role "${title.trim()}" already exists` }, { status: 409 })

  const created = await db.employeeRole.create({
    data: { id: crypto.randomUUID(), title: title.trim(), locationId: locationId || null },
    include: { location: { select: { id: true, name: true } } },
  })
  return NextResponse.json(created, { status: 201 })
}
