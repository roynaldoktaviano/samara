import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { leadWebsiteWhere } from '@/lib/lead-website'
import { leadOwnerScope } from '@/lib/lead-access'
import { classifyLeadOrigin, LEAD_ORIGINS, LEAD_ORIGIN_SELECT, sourceLabel, type LeadOrigin } from '@/lib/lead-origin'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { isLeadEntrySource, refreshLeadEntrySources } from '@/lib/lead-entry-source'
import { runDealMakerLocked } from '@/lib/deal-maker'

// New leads (webhooks, chats, the Freshsales sync) arrive without Lead.entrySource; classify them
// before listing. Throttled per process — the 15-min Freshsales job re-checks every lead anyway.
let lastEntrySourceRefresh = 0
async function classifyNewLeads(db: Parameters<typeof refreshLeadEntrySources>[0]) {
  if (Date.now() - lastEntrySourceRefresh < 20_000) return
  lastEntrySourceRefresh = Date.now()
  try { await refreshLeadEntrySources(db, { onlyMissing: true }) } catch (err) { console.error('[leads] entry source refresh failed:', err) }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  try {
    const { searchParams } = new URL(request.url)
    const search  = searchParams.get('search')
    const website = searchParams.get('website')
    const source  = searchParams.get('source')
    const origin  = searchParams.get('origin')
    const stage   = searchParams.get('stage')
    // Source tab on the Leads page — one of LEAD_ENTRY_SOURCES (src/lib/lead-entry-source.ts),
    // i.e. where the lead first came in from. Every lead sits in exactly one tab.
    const channelParam = searchParams.get('channel')
    const channel = isLeadEntrySource(channelParam) ? channelParam : null
    const brandParam = searchParams.get('brand')
    const brand = WHATSAPP_BRANDS.includes(brandParam as WhatsappBrand) ? brandParam as WhatsappBrand : null
    const dateFrom = searchParams.get('dateFrom')
    const dateTo   = searchParams.get('dateTo')
    const campaign = searchParams.get('campaign')
    const yacht    = searchParams.get('yacht')
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '500') || 500, 2000)
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
    const sort   = searchParams.get('sort') === 'asc' ? 'asc' : 'desc'

    await classifyNewLeads(db)

    const where: Record<string, unknown> = { deletedAt: null, ...leadOwnerScope((session.user as { role?: string }).role, session.user.id) }
    if (stage) where.stage = stage
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { instagram: { contains: search.replace(/^@/, ''), mode: 'insensitive' } },
      ]
    }
    // A lead can have inquiries from more than one site/source — match if any
    // of them came from the selected website/source, rather than pinning to
    // first/latest. Kept as separate `some` clauses (not one shared filter)
    // so a website match and a source match don't have to be the same inquiry.
    const inquiryFilters: Record<string, unknown>[] = []
    if (website) inquiryFilters.push(leadWebsiteWhere([website]))
    if (source) {
      // The Source filter lists grouped labels (e.g. every Google Ads spelling → "Google Ads"),
      // so expand the picked label back to all raw utm_source values that map to it.
      const [firstTouch, lastTouch] = await Promise.all([
        db.inquiry.findMany({ where: { utmSource: { not: null } }, select: { utmSource: true }, distinct: ['utmSource'] }),
        db.inquiry.findMany({ where: { lastSource: { not: null } }, select: { lastSource: true }, distinct: ['lastSource'] }),
      ])
      const raws = [...new Set([...firstTouch.map(r => r.utmSource), ...lastTouch.map(r => r.lastSource)])]
        .filter((s): s is string => !!s && sourceLabel(s) === source)
      if (!raws.length) raws.push(source)
      inquiryFilters.push({ inquiries: { some: { OR: [{ utmSource: { in: raws } }, { lastSource: { in: raws } }] } } })
    }
    // Origin is derived from several UTM/click-id fields with precedence rules (see
    // src/lib/lead-origin.ts), so it's classified here rather than expressed in SQL.
    if (origin && (LEAD_ORIGINS as readonly string[]).includes(origin)) {
      const rows = await db.inquiry.findMany({ where: { leadId: { not: null } }, select: { leadId: true, ...LEAD_ORIGIN_SELECT } })
      const leadIds = [...new Set(rows.filter(r => classifyLeadOrigin(r) === (origin as LeadOrigin)).map(r => r.leadId as string))]
      inquiryFilters.push({ id: { in: leadIds } })
    }
    // Tab counts use everything except the tab itself (search / stage / owner scope / filters).
    const countWhere = { ...where, ...(inquiryFilters.length > 0 && { AND: [...inquiryFilters] }) }
    if (channel) where.entrySource = channel
    if (channel === 'INSTANT_FORM' && (dateFrom || dateTo || campaign || yacht)) {
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
    // Brand filter on the chat tabs — the ERP's own thread or the imported Freshchat history.
    if (brand && channel === 'WHATSAPP') inquiryFilters.push({ OR: [{ whatsappConversations: { some: { brand } } }, { freshchatConversations: { some: { brand } } }] })
    if (brand && (channel === 'INSTAGRAM' || channel === 'MESSENGER')) inquiryFilters.push({ OR: [{ instagramConversations: { some: { brand } } }, { freshchatConversations: { some: { brand } } }] })
    if (inquiryFilters.length > 0) where.AND = inquiryFilters

    const [leads, total, grouped] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, name: true } },
          // Meta tab shows the latest instant-form answer (yacht, campaign, trip date) per row.
          ...(channel === 'INSTANT_FORM' && { inquiries: {
            where: { source: 'META_LEAD_AD' },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { createdAt: true, utmSource: true, utmCampaign: true, tripType: true, checkInDate: true, checkOutDate: true, guestCount: true },
          } }),
          // Chat tabs show the latest thread's brand + last message per row.
          ...(channel === 'WHATSAPP' && { whatsappConversations: {
            orderBy: { lastMessageAt: 'desc' as const },
            take: 1,
            select: { brand: true, lastMessageAt: true, lastMessagePreview: true },
          } }),
          ...((channel === 'INSTAGRAM' || channel === 'MESSENGER') && { instagramConversations: {
            orderBy: { lastMessageAt: 'desc' as const },
            take: 1,
            select: { platform: true, brand: true, lastMessageAt: true, lastMessagePreview: true },
          } }),
        },
      }),
      db.lead.count({ where }),
      db.lead.groupBy({ by: ['entrySource'], where: countWhere, _count: { _all: true } }),
    ])
    const sourceCounts: Record<string, number> = {}
    for (const g of grouped) sourceCounts[g.entrySource ?? 'OTHER'] = (sourceCounts[g.entrySource ?? 'OTHER'] ?? 0) + g._count._all

    const unsubscribed = await db.emailUnsubscribe.findMany({ select: { email: true } })
    const unsubscribedSet = new Set(unsubscribed.map(u => u.email.toLowerCase()))
    const result = leads.map(l => ({
      ...l,
      isSubscribed: l.email ? !unsubscribedSet.has(l.email.toLowerCase()) : null,
    }))

    // Body stays a plain array for existing callers; the true count (which
    // can exceed the capped `take`) rides along as a header for callers that
    // display it, e.g. the "N registered" label on the Leads page.
    return NextResponse.json(result, { headers: { 'X-Total-Count': String(total), 'X-Source-Counts': JSON.stringify(sourceCounts) } })
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
      firstName, lastName, nationality, email, phone, instagram, notes,
      productInterest, destinationId, travelStartDate, travelEndDate, travelSeason,
      guestCount, leadQuality, budgetMin, budgetMax, budgetCurrency,
      tripType, tripAmount, tripAmountCurrency, entrySourceManual,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const lead = await db.lead.create({
      data: {
        name, firstName, lastName, nationality, email, phone, notes,
        // Channel picked by sales (Phone, Agent/OTA…) — see src/lib/lead-entry-source.ts.
        ...(isLeadEntrySource(entrySourceManual) && { entrySourceManual, entrySource: entrySourceManual }),
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

    // Every new lead opens a deal (parity B): a SALES rep who types it in owns it; otherwise
    // round-robin of the brand's pool (src/lib/deal-maker.ts). Brand from the yacht interest.
    try {
      if ((session.user as { role?: string }).role === 'SALES') {
        await db.lead.update({ where: { id: lead.id }, data: { ownerId: session.user.id, ownerAssignedAt: new Date() } })
        await db.leadAssignmentLog.create({ data: { leadId: lead.id, toUserId: session.user.id, reason: 'CLAIM' } })
      }
      const made = await runDealMakerLocked(db, {
        leadId: lead.id,
        brand: /otium/i.test(productInterest ?? '') ? 'OTIUM' : /mischief/i.test(productInterest ?? '') ? 'MISCHIEF' : 'SAMARA',
        tripType: tripType === 'PRIVATE_CHARTER' || tripType === 'OPEN_TRIP' ? tripType : null,
        channel: 'MANUAL', enquiry: false, actingUserId: session.user.id,
        travelStartDate: travelStartDate ? new Date(travelStartDate) : null,
        travelEndDate: travelEndDate ? new Date(travelEndDate) : null,
        guestCount: guestCount ? Number(guestCount) : null,
        productInterest: productInterest || null,
      })
      const amount = tripAmount != null && tripAmount !== '' && Number.isFinite(Number(tripAmount)) ? Number(tripAmount) : null
      if (amount !== null) await db.deal.update({ where: { id: made.dealId }, data: { amount, currency: tripAmountCurrency || null } })
    } catch (e) {
      console.error('[leads] deal maker failed', e)
    }

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
