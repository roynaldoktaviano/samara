import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const yachts = await db.yacht.findMany({
      include: {
        _count: {
          select: { bookings: true, crew: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(yachts)
  } catch (error) {
    console.error('Error fetching yachts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch yachts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      model,
      year,
      capacity,
      cabins,
      length,
      hourlyRate,
      dailyRate,
      description,
      image
    } = body

    if (!name || !capacity || !hourlyRate || !dailyRate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const yacht = await db.yacht.create({
      data: {
        name,
        model,
        year: year ? parseInt(year) : null,
        capacity: parseInt(capacity),
        cabins: cabins ? parseInt(cabins) : 0,
        length: length ? parseFloat(length) : null,
        hourlyRate: parseFloat(hourlyRate),
        dailyRate: parseFloat(dailyRate),
        description,
        image,
        status: 'available'
      }
    })

    return NextResponse.json(yacht, { status: 201 })
  } catch (error) {
    console.error('Error creating yacht:', error)
    return NextResponse.json(
      { error: 'Failed to create yacht' },
      { status: 500 }
    )
  }
}
