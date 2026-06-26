import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const yacht = await db.yacht.findUnique({
      where: { id },
      include: { cabins: { include: { pricingTiers: { orderBy: { nights: 'asc' } } }, orderBy: { name: 'asc' } } },
    })
    if (!yacht) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(yacht)
  } catch (error) {
    console.error('Error fetching yacht:', error)
    return NextResponse.json({ error: 'Failed to fetch yacht' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json()
    const { name, model, year, capacity, length, hourlyRate, dailyRate, extraBedTiers, canDiving, canSurfing, description, status, rooms } = body

    if (!name || !capacity || !hourlyRate || !dailyRate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    type RoomPayload = {
      id?: string; name: string; deck?: string; bedType?: string
      capacity?: number; price?: number; extraBeds?: number
      pricingTiers?: { nights: number; price: number }[]
    }
    const validRooms: RoomPayload[] = (rooms ?? []).filter((r: { name?: string }) => r.name?.trim())

    const yacht = await db.$transaction(async (tx) => {
      const updated = await tx.yacht.update({
        where: { id },
        data: {
          name,
          model: model || null,
          year: year ? parseInt(year) : null,
          capacity: parseInt(capacity),
          cabinCount: validRooms.length > 0 ? validRooms.length : undefined,
          length: length ? parseFloat(length) : null,
          hourlyRate: parseFloat(hourlyRate),
          dailyRate: parseFloat(dailyRate),
          extraBedTiers: extraBedTiers ?? [],
          canDiving: canDiving ?? false,
          canSurfing: canSurfing ?? false,
          description: description || null,
          status: status || 'available',
        },
      })

      for (const r of validRooms) {
        const tiers = (r.pricingTiers ?? []).filter(t => t.price > 0)
        if (r.id) {
          await tx.cabin.update({
            where: { id: r.id },
            data: {
              name: r.name,
              deck: r.deck || null,
              bedType: r.bedType || null,
              capacity: r.capacity ? parseInt(String(r.capacity)) : 2,
              price: r.price ? parseFloat(String(r.price)) : 0,
              extraBeds: r.extraBeds ? parseInt(String(r.extraBeds)) : 0,
            },
          })
          // replace all pricing tiers for this cabin
          await tx.cabinPricingTier.deleteMany({ where: { cabinId: r.id } })
          if (tiers.length > 0) {
            await tx.cabinPricingTier.createMany({
              data: tiers.map(t => ({ cabinId: r.id!, nights: t.nights, price: t.price })),
            })
          }
        } else {
          const newCabin = await tx.cabin.create({
            data: {
              yachtId: id,
              name: r.name,
              deck: r.deck || null,
              bedType: r.bedType || null,
              capacity: r.capacity ? parseInt(String(r.capacity)) : 2,
              price: r.price ? parseFloat(String(r.price)) : 0,
              extraBeds: r.extraBeds ? parseInt(String(r.extraBeds)) : 0,
            },
          })
          if (tiers.length > 0) {
            await tx.cabinPricingTier.createMany({
              data: tiers.map(t => ({ cabinId: newCabin.id, nights: t.nights, price: t.price })),
            })
          }
        }
      }

      return updated
    })

    const result = await db.yacht.findUnique({
      where: { id: yacht.id },
      include: {
        cabins: { include: { pricingTiers: { orderBy: { nights: 'asc' } } }, orderBy: { name: 'asc' } },
        _count: { select: { bookings: true, crew: true } },
      },
    })
    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Yacht', entityId: yacht.id,
      detail: `Update yacht: ${name}`,
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error updating yacht:', error)
    return NextResponse.json({ error: 'Failed to update yacht' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params
    const existing = await db.yacht.findUnique({ where: { id }, select: { name: true } })
    await db.yacht.update({ where: { id }, data: { deletedAt: new Date() } })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'DELETE', entity: 'Yacht', entityId: id,
      detail: `Hapus yacht: ${existing?.name ?? id}`,
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting yacht:', error)
    return NextResponse.json({ error: 'Failed to delete yacht' }, { status: 500 })
  }
}
