import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { LEAD_STAGES, type LeadStage } from '@/lib/lead-pipeline'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { WEBSITE_INQUIRY_WHERE } from '@/lib/lead-origin'
import { dealAccessScope } from '@/lib/deal-stage'

const DAY = 24 * 60 * 60 * 1000
// ~28k historical Freshsales imports — the board's NEW column only shows recent ERP deals (and
// every Freshsales one, which Freshsales itself shows), closed columns only recent outcomes.
const NEW_LOOKBACK_DAYS = 30
const CLOSED_LOOKBACK_DAYS = 90
const PER_COLUMN = 200

export type PipelineChannel = 'website' | 'whatsapp' | 'instagram' | 'manual'

// Data for the "Sales Pipeline" board — one card per DEAL (src/lib/deal-maker.ts), like the
// Freshsales Deals board: a person with an open Private Charter and an open Open Trip shows twice.
// The brand tab is the deal's brand (parity B1). SALES see the deals they own (or whose lead they
// own); ADMIN sees all and can filter by owner. Also returns the WhatsApp chats still waiting to
// be triaged. Each card is shaped like the old lead card (person fields from its lead, else its
// guest) so the board UI stays the same; `id` is the deal id, `leadId` / `customerId` the person.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ['ADMIN', 'SALES'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = roleMatches(role, ['ADMIN'])

  const sp = req.nextUrl.searchParams
  const brand = WHATSAPP_BRANDS.includes(sp.get('brand') as WhatsappBrand) ? sp.get('brand') as WhatsappBrand : undefined
  const ownerParam = sp.get('ownerId')
  const channel = sp.get('channel') as PipelineChannel | null
  const q = sp.get('q')?.trim()

  const db = await getDb(session)
  const salesChat: Prisma.WhatsappConversationWhereInput = { category: 'SALES' }

  const filters: Prisma.DealWhereInput[] = [{ deletedAt: null }]
  if (!isAdmin) filters.push(dealAccessScope(role, session.user.id))
  else if (ownerParam === 'unassigned') filters.push({ ownerId: null })
  else if (ownerParam && ownerParam !== 'all') filters.push({ ownerId: ownerParam })
  if (brand) filters.push({ brand })
  // Channel = how the person reached us (any of their forms / chats), as before deals existed.
  if (channel === 'website') filters.push({ OR: [{ inquiries: { some: WEBSITE_INQUIRY_WHERE } }, { lead: { inquiries: { some: WEBSITE_INQUIRY_WHERE } } }, { channel: { in: ['WEBSITE_FORM', 'META_FORM'] } }] })
  else if (channel === 'whatsapp') filters.push({ OR: [{ lead: { whatsappConversations: { some: salesChat } } }, { channel: 'WHATSAPP' }] })
  else if (channel === 'instagram') filters.push({ OR: [{ lead: { instagramConversations: { some: {} } } }, { channel: { in: ['INSTAGRAM', 'MESSENGER'] } }] })
  else if (channel === 'manual') filters.push({
    inquiries: { none: WEBSITE_INQUIRY_WHERE },
    channel: { notIn: ['WEBSITE_FORM', 'META_FORM', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER'] },
    OR: [{ leadId: null }, { lead: { inquiries: { none: WEBSITE_INQUIRY_WHERE }, whatsappConversations: { none: salesChat }, instagramConversations: { none: {} } } }],
  })
  if (q) filters.push({ OR: [
    { lead: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } },
    { customer: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } },
    { booking: { bookingCode: { contains: q, mode: 'insensitive' } } },
    { orderId: { contains: q, mode: 'insensitive' } },
  ] })

  const now = Date.now()
  const stageWindow = (stage: LeadStage): Prisma.DealWhereInput => {
    if (stage === 'NEW') return { OR: [{ createdAt: { gte: new Date(now - NEW_LOOKBACK_DAYS * DAY) } }, { freshsalesDealId: { not: null } }] }
    if (stage === 'CLOSED_WON' || stage === 'CLOSED_LOST') return { stageUpdatedAt: { gte: new Date(now - CLOSED_LOOKBACK_DAYS * DAY) } }
    return {}
  }

  const select = {
    id: true, orderId: true, freshsalesDealId: true, brand: true, channel: true, leadId: true, customerId: true,
    stage: true, stageUpdatedAt: true, tripType: true, productInterest: true, amount: true, currency: true, lostReason: true, paymentStatus: true,
    stageChanges: { orderBy: { changedAt: 'asc' as const }, take: 30, select: { id: true, fromStage: true, toStage: true, changedAt: true, source: true } },
    travelStartDate: true, travelEndDate: true, guestCount: true, createdAt: true, ownerAssignedAt: true,
    owner: { select: { id: true, name: true, email: true } },
    booking: {
      select: {
        id: true, bookingCode: true, status: true, totalPrice: true, depositPaid: true, startDate: true, endDate: true,
        guestCount: true, source: true, tripType: true, currency: true, destination: true,
        yacht: { select: { name: true } }, destinationRef: { select: { name: true } },
        openTrip: { select: { destination: true } }, customer: { select: { id: true, name: true } },
      },
    },
    notes: { orderBy: { createdAt: 'desc' as const }, take: 20, select: { id: true, kind: true, body: true, createdAt: true, createdBy: { select: { name: true } } } },
    _count: { select: { inquiries: { where: WEBSITE_INQUIRY_WHERE } } },
    customer: { select: { id: true, name: true, email: true, phone: true } },
    lead: {
      select: {
        id: true, name: true, phone: true, email: true, leadQuality: true, travelSeason: true, productInterest: true,
        budgetMin: true, budgetMax: true, budgetCurrency: true, lastInboundAt: true, lastOutboundAt: true, source: true,
        travelStartDate: true, travelEndDate: true, guestCount: true, deletedAt: true,
        destination: { select: { name: true } },
        instagramConversations: {
          orderBy: { lastMessageAt: 'desc' as const },
          select: { id: true, platform: true, brand: true, lastMessageAt: true, lastMessagePreview: true },
        },
        assignmentLogs: {
          orderBy: { createdAt: 'desc' as const }, take: 10,
          select: { id: true, reason: true, createdAt: true, fromUser: { select: { name: true, email: true } }, toUser: { select: { name: true, email: true } } },
        },
        _count: { select: { inquiries: { where: WEBSITE_INQUIRY_WHERE }, instagramConversations: true } },
        whatsappConversations: {
          where: salesChat,
          orderBy: { lastMessageAt: 'desc' as const },
          select: { id: true, brand: true, lastMessageAt: true, lastMessagePreview: true, unreadCount: true, lastInboundAt: true, lastOutboundAt: true },
        },
      },
    },
  } satisfies Prisma.DealSelect
  type Row = Prisma.DealGetPayload<{ select: typeof select }>

  // Old card shape: person fields from the lead (else the guest), deal fields from the deal.
  const card = (d: Row) => {
    const l = d.lead
    return {
      id: d.id, leadId: d.leadId, customerId: d.customerId, orderId: d.orderId, freshsalesDealId: d.freshsalesDealId,
      brand: d.brand, channel: d.channel, notes: d.notes, paymentStatus: d.paymentStatus, stageChanges: d.stageChanges,
      name: l?.name ?? d.customer?.name ?? d.orderId ?? '—', phone: l?.phone ?? d.customer?.phone ?? null, email: l?.email ?? d.customer?.email ?? null,
      stage: d.stage, stageUpdatedAt: d.stageUpdatedAt, leadQuality: l?.leadQuality ?? null,
      guestCount: d.guestCount ?? l?.guestCount ?? null,
      travelStartDate: d.travelStartDate ?? l?.travelStartDate ?? null, travelEndDate: d.travelEndDate ?? l?.travelEndDate ?? null,
      travelSeason: l?.travelSeason ?? null, productInterest: d.productInterest ?? l?.productInterest ?? null,
      budgetMin: l?.budgetMin ?? null, budgetMax: l?.budgetMax ?? null, budgetCurrency: l?.budgetCurrency ?? null,
      lastInboundAt: l?.lastInboundAt ?? null, lastOutboundAt: l?.lastOutboundAt ?? null,
      lostReason: d.lostReason, createdAt: d.createdAt, source: l?.source ?? null,
      tripType: d.tripType, tripAmount: d.amount, tripAmountCurrency: d.currency,
      booking: d.booking, ownerAssignedAt: d.ownerAssignedAt, owner: d.owner,
      destination: l?.destination ?? null,
      instagramConversations: l?.instagramConversations ?? [],
      assignmentLogs: l?.assignmentLogs ?? [],
      whatsappConversations: l?.whatsappConversations ?? [],
      _count: { inquiries: d._count.inquiries + (l?._count.inquiries ?? 0), instagramConversations: l?._count.instagramConversations ?? 0 },
    }
  }

  const [columns, unsorted] = await Promise.all([
    Promise.all(LEAD_STAGES.map(async stage => {
      const where: Prisma.DealWhereInput = { AND: [...filters, { stage }, stageWindow(stage)] }
      const [items, total] = await Promise.all([
        db.deal.findMany({ where, select, orderBy: { updatedAt: 'desc' }, take: PER_COLUMN }),
        db.deal.count({ where }),
      ])
      return { stage, items: items.map(card), total }
    })),
    channel && channel !== 'whatsapp' ? Promise.resolve([]) : db.whatsappConversation.findMany({
      where: {
        category: 'UNSORTED',
        ...(brand ? { brand } : {}),
        ...(!isAdmin ? { OR: [{ assignedToId: session.user.id }, { assignedToId: null }] } : {}),
      },
      select: {
        id: true, phone: true, contactName: true, brand: true, lastMessageAt: true, lastMessagePreview: true,
        unreadCount: true, assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    }),
  ])

  return NextResponse.json({ columns, unsorted, newLookbackDays: NEW_LOOKBACK_DAYS, closedLookbackDays: CLOSED_LOOKBACK_DAYS })
}
