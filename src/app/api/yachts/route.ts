import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const yachts = await db.yacht.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, model: true, year: true,
        capacity: true, cabinCount: true, length: true,
        hourlyRate: true, dailyRate: true, extraBedTiers: true, canDiving: true, canSurfing: true, description: true,
        image: true, status: true, createdAt: true,
        cabins: {
          select: {
            id: true, name: true, deck: true, bedType: true, capacity: true, price: true, extraBeds: true,
            pricingTiers: { select: { nights: true, price: true }, orderBy: { nights: 'asc' } },
          },
          orderBy: { name: 'asc' },
        },
        destinationPrices: { select: { destinationId: true, price: true, relocationFee: true } },
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
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const { name, model, year, capacity, length, hourlyRate, dailyRate, extraBedTiers, canDiving, canSurfing, description, image, rooms, destinationPrices } = body

    if (!name || !capacity || !hourlyRate || !dailyRate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    type RoomPayload = {
      name: string; deck?: string; bedType?: string; capacity?: number; price?: number; extraBeds?: number
      pricingTiers?: { nights: number; price: number }[]
    }
    const validRooms: RoomPayload[] = (rooms ?? []).filter((r: { name?: string }) => r.name?.trim())

    // Step 1: create yacht + cabins (no nested tiers — avoids query-engine cache issues)
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
        extraBedTiers: extraBedTiers ?? [],
        canDiving: canDiving ?? false,
        canSurfing: canSurfing ?? false,
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
                price: r.price ? parseFloat(String(r.price)) : 0,
                extraBeds: r.extraBeds ? parseInt(String(r.extraBeds)) : 0,
              })),
            }
          : undefined,
      },
      include: { cabins: true },
    })

    // Step 2: create pricing tiers for each cabin
    const tierInserts: { cabinId: string; nights: number; price: number }[] = []
    yacht.cabins.forEach((cabin, i) => {
      const tiers = (validRooms[i]?.pricingTiers ?? []).filter(t => t.price > 0)
      tiers.forEach(t => tierInserts.push({ cabinId: cabin.id, nights: t.nights, price: t.price }))
    })
    if (tierInserts.length > 0) {
      await db.cabinPricingTier.createMany({ data: tierInserts })
    }

    // Step 3: create per-destination price overrides
    const destPrices: { destinationId: string; price: number; relocationFee?: number }[] = (destinationPrices ?? [])
      .filter((d: { destinationId?: string; price?: number }) => d.destinationId && d.price && d.price > 0)
    if (destPrices.length > 0) {
      await db.yachtDestinationPrice.createMany({
        data: destPrices.map(d => ({
          yachtId: yacht.id, destinationId: d.destinationId, price: d.price,
          relocationFee: d.relocationFee && d.relocationFee > 0 ? d.relocationFee : null,
        })),
      })
    }

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Yacht', entityId: yacht.id,
      detail: `Add yacht: ${yacht.name}`,
    }, db).catch(() => {})

    const result = await db.yacht.findUnique({
      where: { id: yacht.id },
      include: {
        cabins: { include: { pricingTiers: { orderBy: { nights: 'asc' } } }, orderBy: { name: 'asc' } },
        destinationPrices: { select: { destinationId: true, price: true, relocationFee: true } },
      },
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating yacht:', error)
    return NextResponse.json({ error: 'Failed to create yacht' }, { status: 500 })
  }
}
