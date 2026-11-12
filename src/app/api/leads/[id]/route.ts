import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadOwnerScope, canAccessLead } from '@/lib/lead-access'
import { leadDealName } from '@/lib/deal-name'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    const lead = await db.lead.findFirst({
      where: { id, ...leadOwnerScope((session.user as { role?: string }).role, session.user.id) },
      include: {
        destination: { select: { name: true } },
        booking: {
          select: {
            id: true, bookingCode: true, status: true, totalPrice: true, currency: true, tripType: true,
            startDate: true, endDate: true, destination: true,
            yacht: { select: { name: true } }, destinationRef: { select: { name: true } },
            openTrip: { select: { destination: true } }, customer: { select: { id: true, name: true } },
          },
        },
      },
    })
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // The Guest this lead became — via its booking, else the guest profile with the same email.
    const phoneTail = lead.phone?.replace(/\D/g, '').slice(-10)
    const guestMatch = [
      ...(lead.email?.trim() ? [{ email: { equals: lead.email.trim(), mode: 'insensitive' as const } }] : []),
      ...(phoneTail && phoneTail.length >= 8 ? [{ phone: { endsWith: phoneTail } }] : []),
    ]
    const guestId = lead.booking?.customer.id ?? (guestMatch.length
      ? (await db.customer.findFirst({ where: { deletedAt: null, OR: guestMatch }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id ?? null
      : null)
    return NextResponse.json({ ...lead, dealName: leadDealName(lead), guestId })
  } catch (error) {
    console.error('Error fetching lead:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getDb(session)
  try {
    const { id } = await params
    const existing = await db.lead.findUnique({ where: { id }, select: { name: true } })
    await db.lead.update({ where: { id }, data: { deletedAt: new Date() } })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'DELETE', entity: 'Lead', entityId: id,
      detail: `Hapus lead: ${existing?.name ?? id}`,
    }, db).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting lead:', error)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { id } = await params
    if (!(await canAccessLead(db, (session.user as { role?: string }).role, session.user.id, id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = await request.json()
    const {
      firstName, lastName, nationality, email, phone, instagram, notes,
      productInterest, destinationId, travelStartDate, travelEndDate, travelSeason,
      guestCount, leadQuality, budgetMin, budgetMax, budgetCurrency,
      tripType, tripAmount, tripAmountCurrency,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const lead = await db.lead.update({
      where: { id },
      data: {
        name, firstName, lastName, nationality, email, phone, notes,
        ...(instagram !== undefined && { instagram: typeof instagram === 'string' ? instagram.trim().replace(/^@/, '') || null : null }),
        productInterest: productInterest || null,
        destinationId: destinationId || null,
        travelStartDate: travelStartDate ? new Date(travelStartDate) : null,
        travelEndDate: travelEndDate ? new Date(travelEndDate) : null,
        travelSeason: travelSeason || null,
        guestCount: guestCount ? Number(guestCount) : null,
        leadQuality: leadQuality || null,
        budgetMin: budgetMin != null && budgetMin !== '' ? Number(budgetMin) : null,
        budgetMax: budgetMax != null && budgetMax !== '' ? Number(budgetMax) : null,
        budgetCurrency: budgetCurrency || null,
        ...(tripType !== undefined && { tripType: tripType === 'PRIVATE_CHARTER' || tripType === 'OPEN_TRIP' ? tripType : null }),
        ...(tripAmount !== undefined && { tripAmount: tripAmount != null && tripAmount !== '' && Number.isFinite(Number(tripAmount)) ? Number(tripAmount) : null }),
        ...(tripAmountCurrency !== undefined && { tripAmountCurrency: tripAmountCurrency || null }),
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'UPDATE', entity: 'Lead', entityId: id,
      detail: `Update lead: ${lead.name}`,
    }, db).catch(() => {})

    return NextResponse.json(lead)
  } catch (error) {
    console.error('Error updating lead:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
