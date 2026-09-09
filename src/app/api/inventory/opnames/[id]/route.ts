import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const OPNAME_ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR']

const OPNAME_INCLUDE = {
  location: { select: { id: true, name: true, type: true } },
  room: { select: { id: true, name: true } },
  countedBy: { select: { id: true, name: true } },
  entries: {
    include: {
      item: { select: { id: true, itemNumber: true, name: true, unitPrice: true, photoKeys: true } },
      replacementRequestItem: { select: { id: true, request: { select: { id: true, prNumber: true, status: true } } } },
    },
    orderBy: [{ itemId: 'asc' as const }, { unitIndex: 'asc' as const }],
  },
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const opname = await db.inventoryOpname.findUnique({ where: { id }, include: OPNAME_INCLUDE })
  if (!opname) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(opname)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const { entries, status, notes } = await req.json() as {
    entries?: { id: string; rating?: number | null; photoKey?: string | null; notes?: string | null }[]
    status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'
    notes?: string
  }

  const opname = await db.inventoryOpname.findUnique({ where: { id } })
  if (!opname) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (opname.status === 'COMPLETED') return NextResponse.json({ error: 'A completed opname cannot be changed' }, { status: 400 })

  if (entries?.length) {
    await Promise.all(
      entries.map(e =>
        db.inventoryOpnameEntry.update({
          where: { id: e.id },
          data: {
            ...(e.rating !== undefined && { rating: e.rating }),
            ...(e.photoKey !== undefined && { photoKey: e.photoKey }),
            ...(e.notes !== undefined && { notes: e.notes }),
          },
        })
      )
    )
  }

  if (status === 'COMPLETED') {
    const unratedCount = await db.inventoryOpnameEntry.count({ where: { opnameId: id, rating: null } })
    if (unratedCount > 0) {
      return NextResponse.json({ error: 'Every unit must be rated before the opname can be completed' }, { status: 400 })
    }
  }

  const updated = await db.inventoryOpname.update({
    where: { id },
    data: {
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(status && { status }),
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
    },
    include: OPNAME_INCLUDE,
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, OPNAME_ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const opname = await db.inventoryOpname.findUnique({ where: { id } })
  if (!opname) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (opname.status === 'COMPLETED') return NextResponse.json({ error: 'A completed opname cannot be deleted' }, { status: 400 })

  await db.inventoryOpname.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
