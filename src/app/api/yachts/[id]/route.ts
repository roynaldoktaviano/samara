import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { roleMatches } from '@/lib/role-utils'

const MARKETING_ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const yacht = await db.yacht.findUnique({
      where: { id },
      include: {
        cabins: { include: { pricingTiers: { orderBy: { nights: 'asc' } } }, orderBy: { name: 'asc' } },
        destinationPrices: { select: { destinationId: true, price: true, relocationFee: true } },
      },
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
    const { name, model, year, capacity, length, hourlyRate, dailyRate, extraBedTiers, canDiving, canSurfing, description, status, rooms, destinationPrices } = body

    if (!name || !capacity || !hourlyRate || !dailyRate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    type RoomPayload = {
      id?: string; name: string; deck?: string; bedType?: string
      capacity?: number; price?: number; extraBeds?: number
      pricingTiers?: { nights: number; price: number; destinationId?: string | null }[]
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
          // replace all pricing tiers for this cabin (both the destination-less fallback
          // rows and any destination-specific rate-card overrides — the incoming payload
          // is expected to carry the full desired set, same as before this just also has
          // a destinationId per row now)
          await tx.cabinPricingTier.deleteMany({ where: { cabinId: r.id } })
          if (tiers.length > 0) {
            await tx.cabinPricingTier.createMany({
              data: tiers.map(t => ({ cabinId: r.id!, nights: t.nights, price: t.price, destinationId: t.destinationId || null })),
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
              data: tiers.map(t => ({ cabinId: newCabin.id, nights: t.nights, price: t.price, destinationId: t.destinationId || null })),
            })
          }
        }
      }

      // replace all destination price overrides for this yacht
      const destPrices: { destinationId: string; price: number; relocationFee?: number }[] = (destinationPrices ?? [])
        .filter((d: { destinationId?: string; price?: number }) => d.destinationId && d.price && d.price > 0)
      await tx.yachtDestinationPrice.deleteMany({ where: { yachtId: id } })
      if (destPrices.length > 0) {
        await tx.yachtDestinationPrice.createMany({
          data: destPrices.map(d => ({
            yachtId: id, destinationId: d.destinationId, price: d.price,
            relocationFee: d.relocationFee && d.relocationFee > 0 ? d.relocationFee : null,
          })),
        })
      }

      return updated
    })

    const result = await db.yacht.findUnique({
      where: { id: yacht.id },
      include: {
        cabins: { include: { pricingTiers: { orderBy: { nights: 'asc' } } }, orderBy: { name: 'asc' } },
        destinationPrices: { select: { destinationId: true, price: true, relocationFee: true } },
        _count: { select: { bookings: true, crew: true } },
      },
    })
    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Yacht', entityId: yacht.id,
      detail: `Update yacht: ${name}`,
    }, db).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error updating yacht:', error)
    return NextResponse.json({ error: 'Failed to update yacht' }, { status: 500 })
  }
}

// PATCH — Agent Portal presentation fields only (image/description/destination/order),
// edited from the Media Kit screen rather than Fleet settings since it's marketing content,
// not operational data. Deliberately narrower than PUT: no name/capacity/pricing/cabins here.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, MARKETING_ALLOWED)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const existing = await db.yacht.findUnique({ where: { id }, select: { name: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: { image?: string | null; description?: string | null; tagline?: string | null; sortOrder?: number } = {}
    if ('image' in body) data.image = body.image || null
    if ('description' in body) data.description = body.description || null
    if ('tagline' in body) data.tagline = body.tagline || null
    if ('sortOrder' in body) data.sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0

    const updated = await db.yacht.update({ where: { id }, data })

    logActivity({
      userId: session.user.id, userName: session.user.name ?? session.user.email ?? 'Unknown',
      userRole: role, action: 'UPDATE', entity: 'Yacht', entityId: id,
      detail: `Update Agent Portal display for yacht: ${existing.name}`,
    }, db).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating yacht display settings:', error)
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
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting yacht:', error)
    return NextResponse.json({ error: 'Failed to delete yacht' }, { status: 500 })
  }
}
