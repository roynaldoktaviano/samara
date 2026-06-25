import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    if (!yachtId) {
      return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })
    }

    const existingCabins = await db.cabin.findMany({
      where: { yachtId },
      include: { pricingTiers: { orderBy: { nights: 'asc' } } },
      orderBy: { name: 'asc' },
    })

    if (existingCabins.length > 0) {
      return NextResponse.json(existingCabins)
    }

    // Auto-generate cabins from yacht.cabinCount if none defined yet
    const yacht = await db.yacht.findUnique({
      where: { id: yachtId },
      select: { cabinCount: true },
    })

    if (!yacht) {
      return NextResponse.json({ error: 'Yacht not found' }, { status: 404 })
    }

    const count = yacht.cabinCount || 0
    if (count === 0) return NextResponse.json([])

    const created = await db.$transaction(
      Array.from({ length: count }, (_, i) =>
        db.cabin.create({
          data: { yachtId, name: `Cabin ${i + 1}`, capacity: 2, price: 0 },
          include: { pricingTiers: true },
        })
      )
    )

    return NextResponse.json(created)
  } catch (error) {
    console.error('Error fetching cabins:', error)
    return NextResponse.json({ error: 'Failed to fetch cabins' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'SUPER_ADMIN'].includes(session?.user?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { yachtId, name, capacity, price, deck, bedType, extraBeds } = body

    if (!yachtId || !name) {
      return NextResponse.json({ error: 'yachtId and name are required' }, { status: 400 })
    }

    const cabin = await db.cabin.create({
      data: {
        yachtId,
        name,
        capacity: capacity ? parseInt(capacity) : 2,
        price: price ? parseFloat(price) : 0,
        deck: deck || null,
        bedType: bedType || null,
        extraBeds: extraBeds ? parseInt(extraBeds) : 0,
      },
    })

    return NextResponse.json(cabin, { status: 201 })
  } catch (error) {
    console.error('Error creating cabin:', error)
    return NextResponse.json({ error: 'Failed to create cabin' }, { status: 500 })
  }
}
