import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['PURCHASING', 'ADMIN', 'SUPER_ADMIN', 'WAREHOUSE']

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [locations, yachts] = await Promise.all([
    db.stockLocation.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
    db.yacht.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  // Auto-sync: ensure every active yacht has a VESSEL StockLocation
  const existingYachtIds = new Set(
    locations.filter(l => l.type === 'VESSEL' && l.yachtId).map(l => l.yachtId!)
  )
  const missingYachts = yachts.filter(y => !existingYachtIds.has(y.id))

  let finalLocations = locations
  if (missingYachts.length > 0) {
    await Promise.all(
      missingYachts.map(y =>
        db.stockLocation.create({
          data: { id: crypto.randomUUID(), name: `Stok ${y.name}`, type: 'VESSEL', yachtId: y.id },
        })
      )
    )
    finalLocations = await db.stockLocation.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] })
  }

  const yachtMap = new Map(yachts.map(y => [y.id, y]))
  const locMap = new Map(finalLocations.map(l => [l.id, l]))

  return NextResponse.json(finalLocations.map(l => ({
    ...l,
    yacht: l.yachtId ? yachtMap.get(l.yachtId) ?? null : null,
    parent: l.parentId ? { id: l.parentId, name: locMap.get(l.parentId)?.name ?? null } : null,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const body = await req.json()
  const { name, type, yachtId, parentId, manager, address, storageClass, managedBy } = body
  if (!name?.trim() || !type) return NextResponse.json({ error: 'name dan type wajib diisi' }, { status: 400 })
  if (type === 'VESSEL' && !yachtId) return NextResponse.json({ error: 'yachtId wajib untuk lokasi kapal' }, { status: 400 })
  const location = await db.stockLocation.create({
    data: {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      yachtId: type === 'VESSEL' ? yachtId : null,
      parentId: parentId || null,
      manager: manager?.trim() || null,
      address: address?.trim() || null,
      storageClass: storageClass || null,
      managedBy: managedBy || 'WAREHOUSE',
    },
  })
  return NextResponse.json(location, { status: 201 })
}
