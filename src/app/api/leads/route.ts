import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadWebsiteWhere } from '@/lib/lead-website'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const search  = searchParams.get('search')
    const website = searchParams.get('website')
    const source  = searchParams.get('source')
    const stage   = searchParams.get('stage')
    // Tab on the Leads page: 'form' = website CF7 form, 'meta' = Meta Lead Ads instant form.
    const channel = searchParams.get('channel')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo   = searchParams.get('dateTo')
    const campaign = searchParams.get('campaign')
    const yacht    = searchParams.get('yacht')
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '500') || 500, 2000)
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
    const sort   = searchParams.get('sort') === 'asc' ? 'asc' : 'desc'

    const where: Record<string, unknown> = { deletedAt: null }
    if (stage) where.stage = stage
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]
    }
    // A lead can have inquiries from more than one site/source — match if any
    // of them came from the selected website/source, rather than pinning to
    // first/latest. Kept as separate `some` clauses (not one shared filter)
    // so a website match and a source match don't have to be the same inquiry.
    const inquiryFilters: Record<string, unknown>[] = []
    if (website) inquiryFilters.push(leadWebsiteWhere([website]))
    if (source)  inquiryFilters.push({ inquiries: { some: { OR: [{ utmSource: source }, { lastSource: source }] } } })
    if (channel === 'form') inquiryFilters.push({ inquiries: { some: { source: 'CF7' } } })
    if (channel === 'meta') {
      // Date/campaign/yacht must all hold on the same Meta inquiry. Date is the Meta lead's
      // own time (the webhook stores it as the inquiry's createdAt), days in WIB.
      const createdAt: Record<string, Date> = {}
      if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00+07:00`)
      if (dateTo)   createdAt.lte = new Date(`${dateTo}T23:59:59.999+07:00`)
      inquiryFilters.push({ inquiries: { some: {
        source: 'META_LEAD_AD',
        ...(Object.keys(createdAt).length > 0 && { createdAt }),
        ...(campaign && { utmCampaign: campaign }),
        ...(yacht && { tripType: yacht }),
      } } })
    }
    if (inquiryFilters.length > 0) where.AND = inquiryFilters

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        // Meta tab shows the latest instant-form answer (yacht, campaign, trip date) per row.
        ...(channel === 'meta' && { include: { inquiries: {
          where: { source: 'META_LEAD_AD' },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          select: { createdAt: true, utmSource: true, utmCampaign: true, tripType: true, checkInDate: true, checkOutDate: true, guestCount: true },
        } } }),
      }),
      db.lead.count({ where }),
    ])

    const unsubscribed = await db.emailUnsubscribe.findMany({ select: { email: true } })
    const unsubscribedSet = new Set(unsubscribed.map(u => u.email.toLowerCase()))
    const result = leads.map(l => ({
      ...l,
      isSubscribed: l.email ? !unsubscribedSet.has(l.email.toLowerCase()) : null,
    }))

    // Body stays a plain array for existing callers; the true count (which
    // can exceed the capped `take`) rides along as a header for callers that
    // display it, e.g. the "N registered" label on the Leads page.
    return NextResponse.json(result, { headers: { 'X-Total-Count': String(total) } })
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const body = await request.json()
    const {
      firstName, lastName, nationality, email, phone, notes,
      productInterest, destinationId, travelStartDate, travelEndDate, travelSeason,
      guestCount, leadQuality, budgetMin, budgetMax, budgetCurrency,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const lead = await db.lead.create({
      data: {
        name, firstName, lastName, nationality, email, phone, notes,
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
      },
    })

    logActivity({
      userId:   session?.user?.id   ?? '',
      userName: session?.user?.name ?? session?.user?.email ?? 'Unknown',
      userRole: (session?.user as { role?: string })?.role ?? '',
      action: 'CREATE', entity: 'Lead', entityId: lead.id,
      detail: `Add lead: ${lead.name}`,
    }, db).catch(() => {})

    return NextResponse.json(lead, { status: 201 })
  } catch (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
