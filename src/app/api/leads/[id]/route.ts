import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { isLeadEntrySource } from '@/lib/lead-entry-source'
import { leadOwnerScope, canAccessLead } from '@/lib/lead-access'
import { leadDealName } from '@/lib/deal-name'
import { chatRole } from '@/lib/role-utils'
import { primaryDealOfLead, updateDealFields } from '@/lib/deal-stage'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    // Exact E.164 only — no partial-number search (src/lib/contact-identity.ts).
    const guestMatch = [
      ...(lead.email?.trim() ? [{ email: { equals: lead.email.trim(), mode: 'insensitive' as const } }] : []),
      ...(lead.phoneE164 ? [{ phoneE164: lead.phoneE164 }] : []),
    ]
    const guestId = lead.booking?.customer.id ?? (guestMatch.length
      ? (await db.customer.findFirst({ where: { deletedAt: null, OR: guestMatch }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id ?? null
      : null)
    // Pipeline deals of this person (src/lib/deal-maker.ts). Lead.stage / tripType / tripAmount are
    // the primary deal's (DB mirror); `?deal=<id>` (board card) returns that deal's values instead.
    const deals = await db.deal.findMany({
      where: { leadId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderId: true, brand: true, tripType: true, productInterest: true, stage: true, stageUpdatedAt: true, amount: true, currency: true,
        travelStartDate: true, travelEndDate: true, guestCount: true, channel: true, createdAt: true, lostReason: true,
        owner: { select: { id: true, name: true } }, booking: { select: { id: true, bookingCode: true } },
      },
    })
    const wanted = req.nextUrl.searchParams.get('deal')
    const explicit = (wanted && deals.find(d => d.id === wanted)) || null
    const openDeal = deals.find(d => d.stage !== 'CLOSED_WON' && d.stage !== 'CLOSED_LOST') || null
    const focus = explicit || openDeal || deals[0] || null
    // Only Won / Lost deals left → the form shows the lead's own trip fields (what sales fill in for the
    // next deal, see PUT and POST ./deal), not the closed deal's.
    const overlay = explicit || openDeal ? {
      stage: focus.stage, tripType: focus.tripType, tripAmount: focus.amount, tripAmountCurrency: focus.currency,
      travelStartDate: focus.travelStartDate ?? lead.travelStartDate, travelEndDate: focus.travelEndDate ?? lead.travelEndDate,
      guestCount: focus.guestCount ?? lead.guestCount,
      productInterest: focus.productInterest ?? lead.productInterest,
    } : {}
    const named = deals.map(d => ({ ...d, name: leadDealName({
      name: lead.name, tripType: d.tripType, productInterest: d.productInterest ?? lead.productInterest,
      travelStartDate: d.travelStartDate ?? lead.travelStartDate, travelEndDate: d.travelEndDate ?? lead.travelEndDate,
      destination: lead.destination, booking: d.booking?.id && lead.booking?.id === d.booking.id ? lead.booking : null,
    }) }))
    return NextResponse.json({ ...lead, ...overlay, dealName: leadDealName({ ...lead, ...overlay }), guestId, deals: named, dealId: focus?.id ?? null, hasOpenDeal: !!openDeal })
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
    // Its open deals leave the board with it (booked / closed ones stay for history and feeds).
    await db.deal.updateMany({ where: { leadId: id, deletedAt: null, bookingId: null, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } }, data: { deletedAt: new Date() } })

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
      tripType, tripAmount, tripAmountCurrency, entrySourceManual, dealId, adConsent,
    } = body

    const name = [firstName, lastName].filter(Boolean).join(' ') || body.name
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    // Trip type / amount / dates / pax belong to the deal (the board card's `dealId`, else the lead's
    // primary deal). A Won / Lost deal is read-only unless ADMIN — refused before anything is saved.
    const role = chatRole((session.user as { role?: string }).role)
    // Without an explicit deal, only an OPEN primary deal takes them — with only Won / Lost deals left
    // they stay on the lead, ready for the next deal ("Create deal", POST ./deal).
    const primary = typeof dealId === 'string' && dealId ? null : await primaryDealOfLead(db, id)
    const deal = typeof dealId === 'string' && dealId
      ? await db.deal.findFirst({ where: { id: dealId, leadId: id }, select: { id: true, stage: true } })
      : primary && primary.stage !== 'CLOSED_WON' && primary.stage !== 'CLOSED_LOST' ? primary : null
    if (deal) {
      const num = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
      const open = deal.stage !== 'CLOSED_WON' && deal.stage !== 'CLOSED_LOST'
      const r = await updateDealFields(db, {
        dealId: deal.id, role,
        data: {
          ...(tripType !== undefined && { tripType: tripType === 'PRIVATE_CHARTER' || tripType === 'OPEN_TRIP' ? tripType : null }),
          ...(tripAmount !== undefined && { amount: num(tripAmount) }),
          // The form defaults the currency to USD — only meaningful next to an amount.
          ...(tripAmountCurrency !== undefined && num(tripAmount) !== null && { currency: tripAmountCurrency || null }),
          // Planned dates / pax also stay on the lead (person); they only go onto an open deal.
          ...(open && travelStartDate !== undefined && { travelStartDate: travelStartDate ? new Date(travelStartDate) : null }),
          ...(open && travelEndDate !== undefined && { travelEndDate: travelEndDate ? new Date(travelEndDate) : null }),
          ...(open && guestCount !== undefined && { guestCount: guestCount ? Number(guestCount) : null }),
          // Yacht: the deal's own (Freshsales Product Interest); also kept on the lead below.
          ...(productInterest !== undefined && { productInterest: productInterest || null }),
        },
      })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    }

    // Every form save sends the channel; "Automatic" only resets anything when a manual one was set.
    const channelPatch = entrySourceManual === undefined ? {}
      : isLeadEntrySource(entrySourceManual) ? { entrySourceManual, entrySource: entrySourceManual }
      : (await db.lead.findUnique({ where: { id }, select: { entrySourceManual: true } }))?.entrySourceManual
        ? { entrySourceManual: null, entrySource: null }
        : {}

    // Ads opt-out recorded by sales (src/lib/ad-consent.ts): only 'denied' — consent must come from the
    // guest, never from sales. Who + when only when it actually changes.
    const consentPatch = adConsent === undefined ? {} : await (async () => {
      const next = adConsent === 'denied' ? 'denied' : null
      const cur = await db.lead.findUnique({ where: { id }, select: { adConsent: true } })
      return cur?.adConsent === next ? {} : { adConsent: next, adConsentAt: next ? new Date() : null, adConsentById: next ? session.user.id : null }
    })()

    const lead = await db.lead.update({
      where: { id },
      data: {
        ...consentPatch,
        name, firstName, lastName, nationality, email, phone, notes,
        // Channel picked by hand wins over the automatic one (src/lib/lead-entry-source.ts);
        // clearing it lets the next classification run fill entrySource again.
        ...channelPatch,
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
        // With a deal these three are the deal's (mirrored onto the lead by DB trigger).
        ...(!deal && tripType !== undefined && { tripType: tripType === 'PRIVATE_CHARTER' || tripType === 'OPEN_TRIP' ? tripType : null }),
        ...(!deal && tripAmount !== undefined && { tripAmount: tripAmount != null && tripAmount !== '' && Number.isFinite(Number(tripAmount)) ? Number(tripAmount) : null }),
        ...(!deal && tripAmountCurrency !== undefined && { tripAmountCurrency: tripAmountCurrency || null }),
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
