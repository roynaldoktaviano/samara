import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { processExpiredHoldsAndPromote } from '@/lib/waiting-list'
import { scheduleTripSheetSync } from '@/lib/google-sheets'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { roleMatches } from '@/lib/role-utils'

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Compute payment status from amounts (never overrides 'completed' or 'cancelled'). */
function paymentStatus(depositPaid: number, totalPrice: number): 'pending' | 'partially_paid' | 'fully_paid' {
  if (depositPaid <= 0)          return 'pending'
  if (depositPaid >= totalPrice) return 'fully_paid'
  return 'partially_paid'
}

/** Map yacht name to booking code initial. */
function yachtInitial(name: string | null | undefined): string {
  if (!name) return 'UNK'
  const n = name.trim()
  if (/samara\s*ii/i.test(n))  return 'SL2'
  if (/samara\s*i\b/i.test(n)) return 'SL1'
  if (/mischief/i.test(n))     return 'MC'
  if (/otium/i.test(n))        return 'OT'
  return n.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
}

/* ── GET ─────────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const session  = await getServerSession(authOptions)
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const userId   = session?.user?.id ?? ''
  const db = await getDb(session)
  try {

    const { searchParams } = new URL(request.url)
    const status      = searchParams.get('status')
    const yachtId     = searchParams.get('yachtId')
    const customerId  = searchParams.get('customerId')
    const source      = searchParams.get('source')
    const tripType    = searchParams.get('tripType')
    const openTripId  = searchParams.get('openTripId')
    const view        = searchParams.get('view')  // 'calendar' = show all + isOwnBooking flag

    // Background: auto-cancel pending bookings past deposit deadline & expired holds
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    Promise.all([
      db.booking.updateMany({
        where: { status: 'pending', depositDueDate: { lt: todayStart } },
        data: { status: 'cancelled' },
      }),
      processExpiredHoldsAndPromote(db),
    ]).catch(e => console.error('[bookings] background housekeeping failed:', e))

    const where: Record<string, unknown> = {}
    if (status)     where.status     = status
    if (yachtId)    where.yachtId    = yachtId
    if (customerId) where.customerId = customerId
    if (source)     where.source     = source
    if (tripType)   where.tripType   = tripType
    if (openTripId) where.openTripId = openTripId

    // SALES: kalender tampilkan semua booking tapi dengan flag isOwnBooking.
    // Untuk request lain (list, detail), tetap filter ke booking sendiri saja.
    const isCalendarView = view === 'calendar'
    if (roleMatches(userRole, ['SALES']) && userId && !isCalendarView) {
      where.salespersonId = userId
    }

    const bookings = await db.booking.findMany({
      where,
      select: {
        id: true, bookingCode: true, source: true, tripType: true,
        startDate: true, endDate: true, status: true,
        totalPrice: true, depositPaid: true, discount: true,
        depositDueDate: true, finalDueDate: true, holdUntil: true,
        guestCount: true, destination: true, destinationId: true, notes: true, salesperson: true, salespersonId: true, cancelReason: true,
        refundStatus: true, refundDecision: true, refundReason: true, refundProof: true, refundConfirmedAt: true, refundConfirmedBy: true,
        currency: true, exchangeRate: true, createdAt: true, hasDiving: true, hasSurfing: true, hasPhotoPackage: true,
        salespersonUser: { select: { name: true } },
        yacht:     { select: { id: true, name: true, model: true, canDiving: true, canSurfing: true, capacity: true } },
        customer:  { select: { id: true, name: true, email: true, phone: true } },
        agent:        { select: { id: true, name: true, commissionOpenTrip: true, commissionPrivateCharter: true } },
        agentContact: { select: { id: true, name: true, email: true, whatsapp: true } },
        openTrip:  { select: { id: true, title: true, destination: true } },
        guests: {
          select: {
            id: true, isLead: true, customerId: true,
            arrivalPickupTime: true, arrivalHotel: true, arrivalFlight: true,
            departurePickupTime: true, departureHotel: true, departureFlight: true,
            customer: { select: { name: true } },
            cabin:    { select: { id: true, name: true } },
          },
        },
        services: { select: { id: true, name: true, price: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // For calendar view, SALES can see all bookings but non-owned ones are masked
    if (isCalendarView && roleMatches(userRole, ['SALES']) && userId) {
      const masked = bookings.map(b => {
        const isOwn = b.salespersonId === userId
        if (isOwn) return { ...b, isOwnBooking: true }
        // Non-owned: hide customer details, keep only schedule info
        return {
          id: b.id,
          bookingCode: null,
          source: b.source,
          tripType: b.tripType,
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
          totalPrice: null,
          depositPaid: null,
          discount: null,
          depositDueDate: null,
          finalDueDate: null,
          holdUntil: null,
          guestCount: b.guestCount,
          destination: null,
          destinationId: null,
          notes: null,
          salesperson: b.salesperson,
          salespersonUser: b.salespersonUser,
          currency: b.currency,
          exchangeRate: null,
          createdAt: b.createdAt,
          hasDiving: null,
          yacht: b.yacht,
          customer: null,
          agent: null,
          openTrip: b.openTrip,
          guests: [],
          services: [],
          isOwnBooking: false,
        }
      })
      return NextResponse.json(masked)
    }

    return NextResponse.json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}

/* ── POST ────────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)
  const tripSheetId = await getTenantSecret((session.user as { tenantId?: string }).tenantId ?? '', 'tripSheetGoogleSheetId')
  try {
    const body = await request.json()
    const {
      tripType, source, agentId, agentContactId, yachtId, openTripId,
      startDate, endDate, destination, destinationId,
      totalPrice, depositPaid, discount, voucherCode,
      currency, exchangeRate,
      depositDueDate, finalDueDate,
      crewRequired, hasDiving, hasSurfing, hasPhotoPackage, notes,
      guests,              // Array<{ customerId, cabinId?, isLead }>
      services,            // Array<{ name, price }>
      confirmCloseOpenTrips, // boolean: user confirmed closing conflicting open trips
      isOnHold,            // boolean: save as on_hold status
      holdCustomerId,      // existing customer id (skips find/create)
      holdCabinId,         // cabin id for open trip on-hold
      holdGuest,           // { name, phone } for on-hold bookings (no prior customer needed)
      holdUntil,           // ISO datetime string: hold expiry deadline
    } = body

    if (isOnHold) {
      // On-hold: only need trip info + guest name (or existing customer id)
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Missing trip dates' }, { status: 400 })
      }
      if (!holdCustomerId && !holdGuest?.name?.trim()) {
        return NextResponse.json({ error: 'Guest name is required for on-hold booking' }, { status: 400 })
      }
    } else if (!startDate || !endDate || !guests?.length) {
      const missing = [!startDate && 'startDate', !endDate && 'endDate', !guests?.length && 'guests'].filter(Boolean)
      console.error('POST /api/bookings 400 — missing:', missing, '| tripType:', tripType, '| openTripId:', openTripId)
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    // Guests picked from Leads (not yet real Guests) get resolved to a Customer here —
    // reusing an existing Guest if this Lead's contact info already matches one, else
    // creating a new one now (the wizard's own quick-add flow already creates a Customer
    // immediately when staff types a brand-new guest, so this is consistent with existing
    // behavior, not a new risk). The Lead itself is only archived AFTER the booking below
    // is confirmed created (see convertedLeads / archival step near the end of this
    // handler) — a failed booking must never leave a Lead silently converted with no
    // booking behind it.
    const convertedLeads: { leadId: string; customerId: string }[] = []
    const resolvedGuests: { customerId: string; cabinId?: string; isLead?: boolean }[] = []
    if (!isOnHold) {
      for (const g of guests as { customerId?: string; leadId?: string; cabinId?: string; isLead?: boolean }[]) {
        if (g.customerId) { resolvedGuests.push({ customerId: g.customerId, cabinId: g.cabinId, isLead: g.isLead }); continue }
        if (!g.leadId) {
          return NextResponse.json({ error: 'Each guest needs either a customerId or a leadId' }, { status: 400 })
        }
        const crmLead = await db.lead.findUnique({ where: { id: g.leadId } })
        if (!crmLead || crmLead.deletedAt) {
          return NextResponse.json({ error: 'Selected lead is no longer available' }, { status: 400 })
        }

        let customer = crmLead.email
          ? await db.customer.findFirst({ where: { email: crmLead.email, deletedAt: null } })
          : null
        if (!customer && crmLead.phone) {
          customer = await db.customer.findFirst({ where: { phone: crmLead.phone, deletedAt: null } })
        }

        if (customer && crmLead.notes) {
          customer = await db.customer.update({
            where: { id: customer.id },
            data: { operationalNotes: customer.operationalNotes ? `${customer.operationalNotes}\n\n${crmLead.notes}` : crmLead.notes },
          })
        } else if (!customer) {
          customer = await db.customer.create({
            data: {
              name: crmLead.name, firstName: crmLead.firstName, lastName: crmLead.lastName,
              email: crmLead.email, phone: crmLead.phone, nationality: crmLead.nationality,
              operationalNotes: crmLead.notes || null,
            },
          })
        }

        convertedLeads.push({ leadId: crmLead.id, customerId: customer.id })
        resolvedGuests.push({ customerId: customer.id, cabinId: g.cabinId, isLead: g.isLead })
      }
    }

    const lead  = isOnHold ? null : (resolvedGuests.find(g => g.isLead) ?? resolvedGuests[0])
    if (!isOnHold && !lead) {
      return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 })
    }
    const paid  = isFinite(parseFloat(depositPaid)) ? Math.max(0, parseFloat(depositPaid)) : 0
    const total = isFinite(parseFloat(totalPrice))  ? Math.max(0, parseFloat(totalPrice))  : 0

    // ── Conflict check: only for Private Charter ──
    // Open Trip bookings share the same yacht; capacity is managed by the open trip status (open/full/closed).
    if (yachtId && tripType === 'PRIVATE_CHARTER') {
      const start = new Date(startDate)
      const end   = new Date(endDate)

      // Check PC vs existing bookings (PC or OT) on same yacht
      const overlappingBooking = await db.booking.findFirst({
        where: {
          yachtId,
          status: { not: 'cancelled' },
          startDate: { lt: end },
          endDate:   { gt: start },
        },
        select: { bookingCode: true, startDate: true, endDate: true, tripType: true },
      })
      if (overlappingBooking) {
        return NextResponse.json(
          {
            error: 'Yacht is already booked on these dates',
            conflict: true,
            existing: overlappingBooking,
          },
          { status: 409 }
        )
      }

      // Check PC vs open trips on same yacht
      if (tripType === 'PRIVATE_CHARTER') {
        const conflictingOpenTrips = await db.openTrip.findMany({
          where: {
            yachtId,
            status: { in: ['open', 'full'] },
            startDate: { lt: end },
            endDate:   { gt: start },
          },
          select: { id: true, title: true, startDate: true, endDate: true },
        })
        if (conflictingOpenTrips.length > 0 && !confirmCloseOpenTrips) {
          return NextResponse.json(
            { conflict: true, openTrips: conflictingOpenTrips },
            { status: 409 }
          )
        }
      }
    }

    // Resolve yacht name for booking code
    let yachtName: string | null = null
    if (yachtId) {
      const yacht = await db.yacht.findUnique({ where: { id: yachtId }, select: { name: true } })
      yachtName = yacht?.name ?? null
    } else if (openTripId) {
      const trip = await db.openTrip.findUnique({
        where: { id: openTripId },
        include: { yacht: { select: { name: true } } },
      })
      yachtName = trip?.yacht?.name ?? null
    }

    const yInit  = yachtInitial(yachtName)
    const tInit  = (tripType === 'OPEN_TRIP') ? 'ST' : 'PC'
    const prefix = `${yInit}-${tInit}-`

    const { nextVal } = await import('@/lib/counter')
    // Retry up to 5 times in case counter is behind existing codes
    const generateCode = async (): Promise<string> => {
      for (let i = 0; i < 5; i++) {
        const num  = await nextVal(`booking:${prefix}`, db)
        const code = `${prefix}${String(num).padStart(4, '0')}`
        const exists = await db.booking.findUnique({ where: { bookingCode: code }, select: { id: true } })
        if (!exists) return code
      }
      throw new Error('Failed to generate unique booking code after retries')
    }
    const bookingCode = await generateCode()

    // For on-hold: use provided customer id, or find/create by phone+name
    let leadCustomerId: string
    if (isOnHold) {
      if (holdCustomerId) {
        leadCustomerId = holdCustomerId
      } else {
        const existingCust = holdGuest.phone
          ? await db.customer.findFirst({ where: { phone: holdGuest.phone } })
          : null
        if (existingCust) {
          leadCustomerId = existingCust.id
        } else {
          const newCust = await db.customer.create({
            data: {
              name:  holdGuest.name.trim(),
              phone: holdGuest.phone?.trim() || null,
              email: holdGuest.email?.trim() || null,
            },
            select: { id: true },
          })
          leadCustomerId = newCust.id
        }
      }
    } else {
      // Guarded above: !isOnHold implies lead is non-null here.
      leadCustomerId = lead!.customerId
    }

    const booking = await db.booking.create({
      data: {
        bookingCode,
        customerId:    leadCustomerId,
        agentId:        agentId        || null,
        agentContactId: agentContactId || null,
        openTripId:    openTripId || null,
        source:        source || 'DIRECT',
        tripType:      tripType || 'PRIVATE_CHARTER',
        yachtId:       yachtId || null,
        startDate:     new Date(startDate),
        endDate:       new Date(endDate),
        destination:   destination || null,
        destinationId: destinationId || null,
        totalPrice:    isOnHold ? 0 : total,
        depositPaid:   isOnHold ? 0 : paid,
        discount:      parseFloat(discount) || 0,
        depositDueDate: depositDueDate ? new Date(depositDueDate) : null,
        finalDueDate:   finalDueDate   ? new Date(finalDueDate)   : null,
        holdUntil:      isOnHold && holdUntil ? new Date(holdUntil) : null,
        status:         isOnHold ? 'on_hold' : paymentStatus(paid, total),
        guestCount:     isOnHold ? 1 : resolvedGuests.length,
        crewRequired:   crewRequired ?? false,
        hasDiving:      hasDiving ?? false,
        hasSurfing:     hasSurfing ?? false,
        hasPhotoPackage: hasPhotoPackage ?? false,
        notes:          notes || null,
        voucherCode:    voucherCode || null,
        currency:       currency || 'USD',
        exchangeRate:   (currency && currency !== 'USD' && exchangeRate) ? parseFloat(exchangeRate) : null,
        salesperson:    session?.user?.name || null,
        salespersonId:  session?.user?.id   || null,
        guests: {
          create: isOnHold
            ? [{ customerId: leadCustomerId, isLead: true, cabinId: holdCabinId || null }]
            : resolvedGuests.map(g => ({
                customerId: g.customerId,
                cabinId:    g.cabinId || null,
                isLead:     g.isLead ?? false,
              })),
        },
        services: !isOnHold && (services ?? []).filter((s: { name?: string }) => s.name?.trim()).length > 0
          ? {
              create: (services as { name: string; price: number | string; qty?: number }[])
                .filter(s => s.name?.trim())
                .map(s => ({ name: s.name, price: parseFloat(String(s.price)) || 0, quantity: s.qty ?? 1 })),
            }
          : undefined,
      },
      select: { id: true, bookingCode: true, status: true },
    })

    // Booking is confirmed created — now safe to archive any Leads that were
    // converted into Guests above (never do this before booking.create succeeds).
    // Best-effort: the booking itself is already secured, so a failure here is
    // logged rather than surfaced as a failed booking creation.
    if (convertedLeads.length > 0) {
      await Promise.all(convertedLeads.map(({ leadId, customerId }) => Promise.all([
        db.inquiry.updateMany({ where: { leadId }, data: { leadId: null, customerId } }),
        db.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } }),
      ]))).catch(err => console.error('[bookings] Failed to archive converted lead(s):', err))
    }

    // Close any conflicting open trips (private charter override)
    if (tripType === 'PRIVATE_CHARTER' && yachtId && confirmCloseOpenTrips) {
      const start = new Date(startDate)
      const end   = new Date(endDate)
      await db.openTrip.updateMany({
        where: {
          yachtId,
          status: { in: ['open', 'full'] },
          startDate: { lt: end },
          endDate:   { gt: start },
        },
        data: {
          status: 'closed',
          closedReason: `Dialihkan ke Private Charter ${booking.bookingCode}`,
        },
      })
    }

    // Increment voucher usage atomically — only if still under maxUses
    if (voucherCode) {
      const code = String(voucherCode).toUpperCase().trim()
      await db.$executeRaw`
        UPDATE vouchers
        SET "usedCount" = "usedCount" + 1
        WHERE code = ${code}
          AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      `.catch(e => console.error('voucher increment failed:', e))
    }

    const userId   = session?.user?.id   ?? ''
    const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'
    const userRole = (session?.user as { role?: string })?.role ?? ''
    logActivity({
      userId, userName, userRole,
      action: 'CREATE', entity: 'Booking', entityId: booking.id,
      detail: `New booking ${booking.bookingCode}`,
    }, db).catch(() => {})

    scheduleTripSheetSync(db, tripSheetId)
    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    console.error('Error creating booking:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
