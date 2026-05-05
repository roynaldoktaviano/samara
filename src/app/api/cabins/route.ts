import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yachtId = searchParams.get('yachtId')

    if (!yachtId) {
      return NextResponse.json({ error: 'yachtId is required' }, { status: 400 })
    }

    const existingCabins = await db.cabin.findMany({
      where: { yachtId },
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
          data: {
            yachtId,
            name: `Cabin ${i + 1}`,
            capacity: 2,
          },
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
  try {
    const body = await request.json()
    const { yachtId, name, capacity, deck, type } = body

    if (!yachtId || !name) {
      return NextResponse.json({ error: 'yachtId and name are required' }, { status: 400 })
    }

    const cabin = await db.cabin.create({
      data: {
        yachtId,
        name,
        capacity: capacity ? parseInt(capacity) : 2,
        deck: deck || null,
        type: type || null,
      },
    })

    return NextResponse.json(cabin, { status: 201 })
  } catch (error) {
    console.error('Error creating cabin:', error)
    return NextResponse.json({ error: 'Failed to create cabin' }, { status: 500 })
  }
}
