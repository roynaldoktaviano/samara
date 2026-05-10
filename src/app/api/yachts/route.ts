import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export async function GET() {
  try {
    const yachts = await db.yacht.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, model: true, year: true,
        capacity: true, cabinCount: true, length: true,
        hourlyRate: true, dailyRate: true, description: true,
        image: true, status: true, createdAt: true,
        cabins: {
          select: { id: true, name: true, deck: true, bedType: true, capacity: true, extraBeds: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { bookings: true, crew: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(yachts)
  } catch (error) {
    console.error('Error fetching yachts:', error)
    return NextResponse.json({ error: 'Failed to fetch yachts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const { name, model, year, capacity, length, hourlyRate, dailyRate, description, image, rooms } = body

    if (!name || !capacity || !hourlyRate || !dailyRate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validRooms: { name: string; deck?: string; bedType?: string; capacity: number; extraBeds: number }[] =
      (rooms ?? []).filter((r: { name?: string }) => r.name?.trim())

    const yacht = await db.yacht.create({
      data: {
        name,
        model: model || null,
        year: year ? parseInt(year) : null,
        capacity: parseInt(capacity),
        cabinCount: validRooms.length,
        length: length ? parseFloat(length) : null,
        hourlyRate: parseFloat(hourlyRate),
        dailyRate: parseFloat(dailyRate),
        description: description || null,
        image: image || null,
        status: 'available',
        cabins: validRooms.length > 0
          ? {
              create: validRooms.map((r) => ({
                name: r.name,
                deck: r.deck || null,
                bedType: r.bedType || null,
                capacity: r.capacity ? parseInt(String(r.capacity)) : 2,
                extraBeds: r.extraBeds ? parseInt(String(r.extraBeds)) : 0,
              })),
            }
          : undefined,
      },
      include: { cabins: true },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Yacht', entityId: yacht.id,
      detail: `Tambah yacht: ${yacht.name}`,
    }).catch(() => {})

    return NextResponse.json(yacht, { status: 201 })
  } catch (error) {
    console.error('Error creating yacht:', error)
    return NextResponse.json({ error: 'Failed to create yacht' }, { status: 500 })
  }
}
