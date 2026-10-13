import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { salesCanAccessConversation } from '@/lib/whatsapp-distribution'

export interface WhatsappContactPanel {
  lead: {
    id: string; name: string; email: string | null; nationality: string | null; stage: string; leadQuality: string | null
    source: string | null; ownerName: string | null; productInterest: string | null; destination: string | null
    travelStartDate: string | null; travelEndDate: string | null; travelSeason: string | null; guestCount: number | null
    budgetMin: number | null; budgetMax: number | null; budgetCurrency: string | null; notes: string | null
  } | null
  customer: {
    id: string; name: string; email: string | null; nationality: string | null
    bookings: { id: string; bookingCode: string; status: string; startDate: string; endDate: string; yacht: string | null; destination: string | null; guestCount: number; totalPrice: number; currency: string }[]
  } | null
  // The same number's threads on our other WhatsApp numbers (threads are per brand).
  otherChats: { id: string; brand: string; lastMessageAt: string; assignedToName: string | null; canOpen: boolean }[]
}

const BOOKING_LIMIT = 5

// Last 10 digits, same matching rule as src/lib/whatsapp-lead.ts — guests' phones are
// stored however they were typed.
function phoneTail(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-10) : null
}

async function loadConversation(id: string) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !['ADMIN', 'SALES'].includes(role)) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const db = await getDb(session)
  const conversation = await db.whatsappConversation.findUnique({ where: { id }, select: { id: true, phone: true, leadId: true, assignedToId: true } })
  if (!conversation || (role === 'SALES' && !salesCanAccessConversation(conversation, session.user.id))) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const
  }
  return { session, role, db, conversation } as const
}

// Side panel next to a WhatsApp thread: who this person is in the CRM (linked Lead), whether
// they've sailed with us before (Customer with the same number + recent bookings), and their
// chats on our other numbers — so a rep doesn't have to leave the chat to get context.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadConversation(id)
  if ('error' in loaded) return loaded.error
  const { db, conversation, role, session } = loaded
  const tail = phoneTail(conversation.phone)

  const [lead, customerRow, otherChats] = await Promise.all([
    conversation.leadId ? db.lead.findFirst({
      where: { id: conversation.leadId, deletedAt: null },
      include: { owner: { select: { name: true, email: true } }, destination: { select: { name: true } } },
    }) : null,
    tail ? db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Customer"
      WHERE "deletedAt" IS NULL AND phone IS NOT NULL
        AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = ${tail}
      ORDER BY "createdAt" DESC LIMIT 1
    `.then(r => r[0] ?? null) : null,
    db.whatsappConversation.findMany({
      where: { phone: conversation.phone, id: { not: id } },
      select: { id: true, brand: true, lastMessageAt: true, assignedToId: true, assignedTo: { select: { name: true, email: true } } },
    }),
  ])

  const customer = customerRow ? await db.customer.findUnique({
    where: { id: customerRow.id },
    select: {
      id: true, name: true, email: true, nationality: true,
      bookings: {
        orderBy: { startDate: 'desc' },
        take: BOOKING_LIMIT,
        select: {
          id: true, bookingCode: true, status: true, startDate: true, endDate: true, guestCount: true, totalPrice: true, currency: true,
          destination: true, destinationRef: { select: { name: true } }, yacht: { select: { name: true } },
        },
      },
    },
  }) : null

  const body: WhatsappContactPanel = {
    lead: lead ? {
      id: lead.id, name: lead.name, email: lead.email, nationality: lead.nationality, stage: lead.stage, leadQuality: lead.leadQuality,
      source: lead.source, ownerName: lead.owner?.name || lead.owner?.email || null, productInterest: lead.productInterest,
      destination: lead.destination?.name ?? null,
      travelStartDate: lead.travelStartDate?.toISOString() ?? null, travelEndDate: lead.travelEndDate?.toISOString() ?? null,
      travelSeason: lead.travelSeason, guestCount: lead.guestCount,
      budgetMin: lead.budgetMin, budgetMax: lead.budgetMax, budgetCurrency: lead.budgetCurrency, notes: lead.notes,
    } : null,
    customer: customer ? {
      id: customer.id, name: customer.name, email: customer.email, nationality: customer.nationality,
      bookings: customer.bookings.map(b => ({
        id: b.id, bookingCode: b.bookingCode, status: b.status, startDate: b.startDate.toISOString(), endDate: b.endDate.toISOString(),
        yacht: b.yacht?.name ?? null, destination: b.destinationRef?.name ?? b.destination ?? null,
        guestCount: b.guestCount, totalPrice: b.totalPrice, currency: b.currency,
      })),
    } : null,
    otherChats: otherChats.map(c => ({ id: c.id, brand: c.brand, lastMessageAt: c.lastMessageAt.toISOString(), assignedToName: c.assignedTo?.name || c.assignedTo?.email || null,
      canOpen: role !== 'SALES' || salesCanAccessConversation(c, session.user.id),
    })),
  }
  return NextResponse.json(body)
}

// `{ notes }` — edits the linked Lead's notes straight from the chat (the full Lead form
// lives in Leads; this is just the quick "what did they tell me" scratchpad).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadConversation(id)
  if ('error' in loaded) return loaded.error
  const { db, conversation } = loaded
  const { notes } = await req.json().catch(() => ({})) as { notes?: unknown }
  if (typeof notes !== 'string') return NextResponse.json({ error: 'notes is required' }, { status: 400 })
  if (!conversation.leadId) return NextResponse.json({ error: 'Set this chat’s category to Sales first so it has a Lead' }, { status: 400 })

  await db.lead.update({ where: { id: conversation.leadId }, data: { notes: notes.trim() || null } })
  return NextResponse.json({ ok: true })
}
