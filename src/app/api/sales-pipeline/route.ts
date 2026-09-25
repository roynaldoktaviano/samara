import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'
import { LEAD_STAGES, type LeadStage } from '@/lib/lead-pipeline'
import { WHATSAPP_BRANDS, type WhatsappBrand } from '@/lib/whatsapp-brands'

const DAY = 24 * 60 * 60 * 1000
// ~28k historical Freshsales imports all sit at NEW — the board's NEW column only shows
// recent ones, and closed columns only recent outcomes, so it stays a working board.
const NEW_LOOKBACK_DAYS = 30
const CLOSED_LOOKBACK_DAYS = 90
const PER_COLUMN = 200

export type PipelineChannel = 'website' | 'whatsapp' | 'manual'

// Data for the "Sales Pipeline" board — every Lead regardless of channel (website form,
// WhatsApp, manual), one card per person. SALES sees leads they own plus unowned ones they
// can claim; ADMIN sees all and can filter by owner. Also returns the WhatsApp chats still
// waiting to be triaged (a chat only becomes a Lead once marked SALES, see whatsapp-lead.ts).
// Won leads are soft-deleted when a booking converts them (POST /api/bookings), so
// CLOSED_WON is read regardless of deletedAt.
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

  const filters: Prisma.LeadWhereInput[] = [
    // A lead created from a WhatsApp chat that was later re-triaged away from SALES
    // (vendor/spam) drops off the board. Spelled as a positive OR — a NOT(...) here would
    // also drop every lead whose `source` is NULL (SQL three-valued logic).
    { OR: [
      { source: null },
      { NOT: { source: { startsWith: 'WHATSAPP_' } } },
      { whatsappConversations: { some: salesChat } },
    ] },
  ]
  if (!isAdmin) filters.push({ OR: [{ ownerId: session.user.id }, { ownerId: null }] })
  else if (ownerParam === 'unassigned') filters.push({ ownerId: null })
  else if (ownerParam && ownerParam !== 'all') filters.push({ ownerId: ownerParam })
  if (channel === 'website') filters.push({ inquiries: { some: {} } })
  else if (channel === 'whatsapp') filters.push({ whatsappConversations: { some: salesChat } })
  else if (channel === 'manual') filters.push({ inquiries: { none: {} }, whatsappConversations: { none: salesChat } })
  if (brand) filters.push({ whatsappConversations: { some: { ...salesChat, brand } } })
  if (q) filters.push({ OR: [
    { name: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q } },
  ] })

  const now = Date.now()
  const stageWindow = (stage: LeadStage): Prisma.LeadWhereInput => {
    if (stage === 'NEW') return { deletedAt: null, createdAt: { gte: new Date(now - NEW_LOOKBACK_DAYS * DAY) } }
    if (stage === 'CLOSED_WON') return { stageUpdatedAt: { gte: new Date(now - CLOSED_LOOKBACK_DAYS * DAY) } }
    if (stage === 'CLOSED_LOST') return { deletedAt: null, stageUpdatedAt: { gte: new Date(now - CLOSED_LOOKBACK_DAYS * DAY) } }
    return { deletedAt: null }
  }

  const select = {
    id: true, name: true, phone: true, email: true, stage: true, stageUpdatedAt: true, leadQuality: true,
    guestCount: true, travelStartDate: true, travelSeason: true, proposalSentAt: true,
    lostReason: true, createdAt: true, source: true, ownerAssignedAt: true,
    assignmentLogs: {
      orderBy: { createdAt: 'desc' as const }, take: 10,
      select: { id: true, reason: true, createdAt: true, fromUser: { select: { name: true, email: true } }, toUser: { select: { name: true, email: true } } },
    },
    owner: { select: { id: true, name: true, email: true } },
    destination: { select: { name: true } },
    _count: { select: { inquiries: true } },
    whatsappConversations: {
      where: salesChat,
      orderBy: { lastMessageAt: 'desc' as const },
      select: {
        id: true, brand: true, lastMessageAt: true, lastMessagePreview: true, unreadCount: true,
        lastInboundAt: true, lastOutboundAt: true,
      },
    },
  } satisfies Prisma.LeadSelect

  const [columns, unsorted] = await Promise.all([
    Promise.all(LEAD_STAGES.map(async stage => {
      const where: Prisma.LeadWhereInput = { AND: [...filters, { stage }, stageWindow(stage)] }
      const [items, total] = await Promise.all([
        db.lead.findMany({ where, select, orderBy: { updatedAt: 'desc' }, take: PER_COLUMN }),
        db.lead.count({ where }),
      ])
      return { stage, items, total }
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
