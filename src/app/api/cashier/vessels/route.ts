import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { withRetry } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const yachts = await withRetry(db, () => db.yacht.findMany({
    where: {
      deletedAt: null,
      stockLocations: { some: { type: 'VESSEL', isActive: true } },
    },
    select: {
      id: true, name: true, image: true,
      stockLocations: { where: { type: 'VESSEL', isActive: true }, select: { id: true, name: true }, take: 1 },
    },
    orderBy: { name: 'asc' },
  }))

  return NextResponse.json(yachts.map(y => ({
    id: y.id,
    name: y.name,
    image: y.image,
    locationId: y.stockLocations[0]?.id ?? null,
  })))
}
