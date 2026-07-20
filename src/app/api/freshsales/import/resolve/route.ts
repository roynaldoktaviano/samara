import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING']

interface InquiryPayload {
  checkInDate: string | null
  checkOutDate: string | null
  guestCount: number | null
  tripType: string | null
  message: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  rawPayload: Record<string, unknown>
  createdAt: string | null
}

interface RowData {
  name: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null
  nationality: string | null; address: string | null
}

interface Decision {
  freshsalesContactId: string
  action: 'merge' | 'create'
  existingId?: string
  data: RowData
  inquiry?: InquiryPayload | null
}

// Lead has no `address` column — see leadProfileData in the batch import
// route for the same rule.
function leadProfileData(data: RowData) {
  const { address: _address, ...rest } = data
  return rest
}

function toInquiryCreateData(inquiry: InquiryPayload) {
  return {
    source: 'freshsales',
    checkInDate: inquiry.checkInDate ? new Date(inquiry.checkInDate) : null,
    checkOutDate: inquiry.checkOutDate ? new Date(inquiry.checkOutDate) : null,
    guestCount: inquiry.guestCount,
    tripType: inquiry.tripType,
    message: inquiry.message,
    utmSource: inquiry.utmSource,
    utmMedium: inquiry.utmMedium,
    utmCampaign: inquiry.utmCampaign,
    utmTerm: inquiry.utmTerm,
    rawPayload: inquiry.rawPayload as Prisma.InputJsonValue,
    ...(inquiry.createdAt ? { createdAt: new Date(inquiry.createdAt) } : {}),
  }
}

// Applies the user's per-contact decisions from the duplicate-review step in
// FreshsalesImportModal: "merge" links the Freshsales contact to an existing
// Lead/Customer (found by matching email/phone) and refreshes its profile
// fields; "create" makes it a separate new record after all. Either way this
// is the first time this Freshsales contact's data lands, so an Inquiry row
// is created (if the contact carried any trip/request signal) same as for a
// brand-new import.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const body = await req.json().catch(() => ({}))
  const target = body?.target as 'lead' | 'guest'
  const decisions = Array.isArray(body?.decisions) ? (body.decisions as Decision[]) : []
  if (target !== 'lead' && target !== 'guest') return NextResponse.json({ error: 'target must be "lead" or "guest"' }, { status: 400 })
  if (!decisions.length) return NextResponse.json({ error: 'No decisions provided' }, { status: 400 })

  let merged = 0
  let createdNew = 0

  if (target === 'lead') {
    for (const d of decisions) {
      const profile = leadProfileData(d.data)
      if (d.action === 'merge' && d.existingId) {
        await db.lead.update({ where: { id: d.existingId }, data: { ...profile, freshsalesContactId: d.freshsalesContactId } })
        if (d.inquiry) await db.inquiry.create({ data: { leadId: d.existingId, ...toInquiryCreateData(d.inquiry) } })
        merged++
      } else {
        const lead = await db.lead.upsert({
          where: { freshsalesContactId: d.freshsalesContactId },
          create: { ...profile, freshsalesContactId: d.freshsalesContactId },
          update: profile,
        })
        if (d.inquiry) await db.inquiry.create({ data: { leadId: lead.id, ...toInquiryCreateData(d.inquiry) } })
        createdNew++
      }
    }
  } else {
    for (const d of decisions) {
      if (d.action === 'merge' && d.existingId) {
        await db.customer.update({ where: { id: d.existingId }, data: { ...d.data, freshsalesContactId: d.freshsalesContactId } })
        if (d.inquiry) await db.inquiry.create({ data: { customerId: d.existingId, ...toInquiryCreateData(d.inquiry) } })
        merged++
      } else {
        const customer = await db.customer.upsert({
          where: { freshsalesContactId: d.freshsalesContactId },
          create: { ...d.data, freshsalesContactId: d.freshsalesContactId },
          update: d.data,
        })
        if (d.inquiry) await db.inquiry.create({ data: { customerId: customer.id, ...toInquiryCreateData(d.inquiry) } })
        createdNew++
      }
    }
  }

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'IMPORT', entity: target === 'lead' ? 'Lead' : 'Customer', entityId: 'freshsales-review',
    detail: `Resolved ${decisions.length} Freshsales duplicate-review decision(s): ${merged} merged, ${createdNew} created new`,
  }, db).catch(() => {})

  return NextResponse.json({ ok: true, merged, created: createdNew })
}
