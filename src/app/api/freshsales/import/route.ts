import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { getTenantSecret } from '@/lib/tenant-secrets'
import type { Prisma } from '@prisma/client'

export const maxDuration = 60

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES', 'MARKETING']
const PAGE_SIZE = 100
// Each request only walks a bounded slice of pages so it stays well inside
// Vercel's function timeout even for 30k+ record views. The client (see
// FreshsalesImportModal) calls this repeatedly with an advancing startPage
// until `done` comes back true.
const DEFAULT_PAGES_PER_BATCH = 10
const MAX_RETRIES = 3
const UPDATE_CONCURRENCY = 10

interface FreshsalesContact {
  id: number; display_name?: string; first_name?: string; last_name?: string
  email?: string; mobile_number?: string; work_number?: string
  city?: string | null; state?: string | null; zipcode?: string | null; country?: string | null
  created_at?: string
  custom_field?: Record<string, unknown> | null
  first_source?: string | null; first_medium?: string | null; first_campaign?: string | null
}

interface RowData {
  name: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null
  nationality: string | null; address: string | null
}
// Lead has no `address` column (it's a lightweight pre-booking profile) — only
// Customer/Guest carries the combined city/state/zip. Strip it before writing
// to Lead so Prisma doesn't reject the unknown field.
function leadProfileData(data: RowData) {
  const { address: _address, ...rest } = data
  return rest
}
interface InquiryPayload {
  checkInDate: Date | null
  checkOutDate: Date | null
  guestCount: number | null
  tripType: string | null
  message: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  rawPayload: Prisma.InputJsonValue
  createdAt: Date | null
}
interface Row { freshsalesContactId: string; data: RowData; inquiry: InquiryPayload | null }
interface ExistingRecord { id: string; name: string; email: string | null; phone: string | null }
interface PossibleMatch {
  freshsalesContactId: string
  freshsalesData: RowData
  inquiry: InquiryPayload | null
  existingId: string
  existingName: string
  existingEmail: string | null
  existingPhone: string | null
  matchedBy: 'email' | 'phone'
}

class FreshsalesApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, data: unknown) {
    super('Freshsales API error')
    this.status = status
    this.data = data
  }
}

// Freshsales caps at 1000 requests/hour/account; a burst of 429s is normal
// under sustained pagination, so retry with backoff (honoring Retry-After)
// instead of failing the whole batch.
async function fetchFreshsalesPage(domain: string, apiKey: string, viewId: string, page: number) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://${domain}/api/contacts/view/${viewId}?page=${page}&per_page=${PAGE_SIZE}&sort=display_name&sort_type=asc`,
      { headers: { Authorization: `Token token=${apiKey}`, 'Content-Type': 'application/json' }, cache: 'no-store' },
    )
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2 ** (attempt + 1)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new FreshsalesApiError(res.status, data)
    return data
  }
}

function parseFreshsalesDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// Trip/request details live in Freshsales' free-form custom_field bag, not a
// fixed shape — most of it is null for any given contact (see the review
// conversation that led here: some contacts have structured trip_date/
// number_of_guests, others only a free-text "details_and_special_requests",
// many have neither). Returns null when there's nothing worth recording, so
// contacts with no trip signal at all don't leave an empty Inquiry row behind.
function buildInquiryPayload(c: FreshsalesContact): InquiryPayload | null {
  const cf = c.custom_field ?? {}
  const checkInDate = parseFreshsalesDate(cf.cf_trip_date)
  const checkOutDate = parseFreshsalesDate(cf.cf_check_out_date)
  const guestCountNum = cf.cf_number_of_guests != null ? parseInt(String(cf.cf_number_of_guests), 10) : NaN
  // Some Freshsales records have garbage in this field (a phone number typed
  // into the wrong custom field, etc.) — bound it to a plausible trip size
  // rather than letting an oversized value blow up the Int column.
  const guestCount = Number.isFinite(guestCountNum) && guestCountNum > 0 && guestCountNum <= 999 ? guestCountNum : null
  const tripType = (typeof cf.cf_trip_type === 'string' && cf.cf_trip_type) || null
  const message = (typeof cf.cf_details_and_special_requests === 'string' && cf.cf_details_and_special_requests) || null
  const utmSource = c.first_source || null
  const utmMedium = c.first_medium || null
  const utmCampaign = c.first_campaign || null
  const utmTerm = (typeof cf.cf_utm_term === 'string' && cf.cf_utm_term) || null

  const hasSignal = checkInDate || checkOutDate || guestCount != null || tripType || message || utmSource || utmMedium || utmCampaign || utmTerm
  if (!hasSignal) return null

  return {
    checkInDate, checkOutDate, guestCount, tripType, message, utmSource, utmMedium, utmCampaign, utmTerm,
    rawPayload: cf as Prisma.InputJsonValue,
    // Each Freshsales contact's inquiry is dated to when they actually
    // submitted it there, not when this import ran — future inquiries (e.g.
    // a new CF7 submission) get their own createdAt as usual.
    createdAt: parseFreshsalesDate(c.created_at),
  }
}

// Contacts that don't match an existing row by freshsalesContactId are checked
// against existing (not-yet-linked) rows by email/phone before being created,
// so the same real person doesn't end up with two records. A match is held
// back for the user to confirm (merge vs. create separate) rather than being
// written automatically.
function findPossibleMatches(candidates: Row[], existing: ExistingRecord[]): { matches: PossibleMatch[]; unmatched: Row[] } {
  const byEmail = new Map<string, ExistingRecord>()
  const byPhone = new Map<string, ExistingRecord>()
  for (const e of existing) {
    if (e.email) byEmail.set(e.email.toLowerCase(), e)
    if (e.phone) byPhone.set(e.phone, e)
  }
  const claimed = new Set<string>()
  const matches: PossibleMatch[] = []
  const unmatched: Row[] = []
  for (const c of candidates) {
    const emailMatch = c.data.email ? byEmail.get(c.data.email.toLowerCase()) : undefined
    const phoneMatch = !emailMatch && c.data.phone ? byPhone.get(c.data.phone) : undefined
    const match = emailMatch ?? phoneMatch
    if (match && !claimed.has(match.id)) {
      claimed.add(match.id)
      matches.push({
        freshsalesContactId: c.freshsalesContactId,
        freshsalesData: c.data,
        inquiry: c.inquiry,
        existingId: match.id,
        existingName: match.name,
        existingEmail: match.email,
        existingPhone: match.phone,
        matchedBy: emailMatch ? 'email' : 'phone',
      })
    } else {
      unmatched.push(c)
    }
  }
  return { matches, unmatched }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const tenantId = (session.user as { tenantId?: string }).tenantId ?? ''
  const [apiKey, domain] = await Promise.all([
    getTenantSecret(tenantId, 'freshsalesApiKey'),
    getTenantSecret(tenantId, 'freshsalesDomain'),
  ])
  if (!apiKey || !domain) return NextResponse.json({ error: 'FRESHSALES_API_KEY / FRESHSALES_DOMAIN not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const viewId = body?.viewId ? String(body.viewId).trim() : ''
  const target = body?.target as 'lead' | 'guest'
  const startPage = Math.max(1, Number(body?.startPage) || 1)
  const pagesPerBatch = Math.max(1, Number(body?.pagesPerBatch) || DEFAULT_PAGES_PER_BATCH)
  if (!viewId) return NextResponse.json({ error: 'View ID is required' }, { status: 400 })
  if (target !== 'lead' && target !== 'guest') return NextResponse.json({ error: 'target must be "lead" or "guest"' }, { status: 400 })

  const lastPageInBatch = startPage + pagesPerBatch - 1
  const batchContacts: FreshsalesContact[] = []
  let page = startPage
  let totalPages = startPage

  try {
    do {
      const data = await fetchFreshsalesPage(domain, apiKey, viewId, page)
      totalPages = data.meta?.total_pages ?? page
      batchContacts.push(...(data.contacts ?? []))
      page++
    } while (page <= totalPages && page <= lastPageInBatch)
  } catch (e) {
    if (e instanceof FreshsalesApiError) {
      return NextResponse.json({ error: 'Freshsales API error', status: e.status, data: e.data }, { status: e.status })
    }
    throw e
  }

  const rows: Row[] = batchContacts.map(c => {
    const freshsalesContactId = String(c.id)
    const name = (c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Unknown').trim()
    const cf = c.custom_field
    return {
      freshsalesContactId,
      data: {
        name,
        firstName: c.first_name || null,
        lastName: c.last_name || null,
        email: c.email || null,
        phone: c.mobile_number || c.work_number || (typeof cf?.cf_whatsapp_number === 'string' ? cf.cf_whatsapp_number : null) || null,
        nationality: c.country || null,
        address: [c.city, c.state, c.zipcode].filter(Boolean).join(', ') || null,
      },
      inquiry: buildInquiryPayload(c),
    }
  })

  const ids = rows.map(r => r.freshsalesContactId)
  let created = 0
  let updated = 0
  let possibleMatches: PossibleMatch[] = []

  // Inquiry rows are created for brand-new Lead/Customer records, and
  // backfilled once for already-linked ones that don't have a Freshsales
  // Inquiry yet (covers contacts imported before this mapping existed, or a
  // prior batch that ran before Inquiry support shipped). Once a record has
  // one, later re-imports of the same view won't add another — otherwise
  // every re-run would duplicate the same trip/message.
  if (target === 'lead') {
    const existingById = ids.length
      ? await db.lead.findMany({ where: { freshsalesContactId: { in: ids } }, select: { freshsalesContactId: true } })
      : []
    const existingIdSet = new Set(existingById.map(e => e.freshsalesContactId))
    const createCandidates = rows.filter(r => !existingIdSet.has(r.freshsalesContactId))
    const toUpdate = rows.filter(r => existingIdSet.has(r.freshsalesContactId))

    const emails = createCandidates.map(r => r.data.email).filter((e): e is string => !!e)
    const phones = createCandidates.map(r => r.data.phone).filter((p): p is string => !!p)
    const existingForMatch: ExistingRecord[] = (emails.length || phones.length)
      ? await db.lead.findMany({
          where: {
            freshsalesContactId: null,
            OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phones.length ? [{ phone: { in: phones } }] : [])],
          },
          select: { id: true, name: true, email: true, phone: true },
        })
      : []
    const { matches, unmatched: toCreate } = findPossibleMatches(createCandidates, existingForMatch)
    possibleMatches = matches

    if (toCreate.length) {
      await db.lead.createMany({ data: toCreate.map(r => ({ ...leadProfileData(r.data), freshsalesContactId: r.freshsalesContactId })), skipDuplicates: true })
      const withInquiry = toCreate.filter(r => r.inquiry)
      if (withInquiry.length) {
        const createdLeads = await db.lead.findMany({
          where: { freshsalesContactId: { in: withInquiry.map(r => r.freshsalesContactId) } },
          select: { id: true, freshsalesContactId: true },
        })
        const idByFsId = new Map(createdLeads.map(l => [l.freshsalesContactId, l.id]))
        const inquiryRows = withInquiry
          .map(r => {
            const leadId = idByFsId.get(r.freshsalesContactId)
            if (!leadId || !r.inquiry) return null
            const { createdAt, ...rest } = r.inquiry
            return { leadId, source: 'freshsales', ...rest, ...(createdAt ? { createdAt } : {}) }
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
        if (inquiryRows.length) await db.inquiry.createMany({ data: inquiryRows })
      }
    }
    const updatedLeads: { id: string; freshsalesContactId: string | null }[] = []
    for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
      const batch = await Promise.all(toUpdate.slice(i, i + UPDATE_CONCURRENCY).map(r =>
        db.lead.update({ where: { freshsalesContactId: r.freshsalesContactId }, data: leadProfileData(r.data) })))
      updatedLeads.push(...batch)
    }
    const updateRowsWithInquiry = toUpdate.filter(r => r.inquiry)
    if (updateRowsWithInquiry.length) {
      const existingInquiries = await db.inquiry.findMany({
        where: { leadId: { in: updatedLeads.map(l => l.id) }, source: 'freshsales' },
        select: { leadId: true },
      })
      const hasInquirySet = new Set(existingInquiries.map(i => i.leadId))
      const idByFsId = new Map(updatedLeads.map(l => [l.freshsalesContactId, l.id]))
      const inquiryRows = updateRowsWithInquiry
        .map(r => {
          const leadId = idByFsId.get(r.freshsalesContactId)
          if (!leadId || hasInquirySet.has(leadId) || !r.inquiry) return null
          const { createdAt, ...rest } = r.inquiry
          return { leadId, source: 'freshsales', ...rest, ...(createdAt ? { createdAt } : {}) }
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
      if (inquiryRows.length) await db.inquiry.createMany({ data: inquiryRows })
    }
    created = toCreate.length
    updated = toUpdate.length
  } else {
    const existingById = ids.length
      ? await db.customer.findMany({ where: { freshsalesContactId: { in: ids } }, select: { freshsalesContactId: true } })
      : []
    const existingIdSet = new Set(existingById.map(e => e.freshsalesContactId))
    const createCandidates = rows.filter(r => !existingIdSet.has(r.freshsalesContactId))
    const toUpdate = rows.filter(r => existingIdSet.has(r.freshsalesContactId))

    const emails = createCandidates.map(r => r.data.email).filter((e): e is string => !!e)
    const phones = createCandidates.map(r => r.data.phone).filter((p): p is string => !!p)
    const existingForMatch: ExistingRecord[] = (emails.length || phones.length)
      ? await db.customer.findMany({
          where: {
            freshsalesContactId: null,
            OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phones.length ? [{ phone: { in: phones } }] : [])],
          },
          select: { id: true, name: true, email: true, phone: true },
        })
      : []
    const { matches, unmatched: toCreate } = findPossibleMatches(createCandidates, existingForMatch)
    possibleMatches = matches

    if (toCreate.length) {
      await db.customer.createMany({ data: toCreate.map(r => ({ ...r.data, freshsalesContactId: r.freshsalesContactId })), skipDuplicates: true })
      const withInquiry = toCreate.filter(r => r.inquiry)
      if (withInquiry.length) {
        const createdCustomers = await db.customer.findMany({
          where: { freshsalesContactId: { in: withInquiry.map(r => r.freshsalesContactId) } },
          select: { id: true, freshsalesContactId: true },
        })
        const idByFsId = new Map(createdCustomers.map(c => [c.freshsalesContactId, c.id]))
        const inquiryRows = withInquiry
          .map(r => {
            const customerId = idByFsId.get(r.freshsalesContactId)
            if (!customerId || !r.inquiry) return null
            const { createdAt, ...rest } = r.inquiry
            return { customerId, source: 'freshsales', ...rest, ...(createdAt ? { createdAt } : {}) }
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
        if (inquiryRows.length) await db.inquiry.createMany({ data: inquiryRows })
      }
    }
    const updatedCustomers: { id: string; freshsalesContactId: string | null }[] = []
    for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
      const batch = await Promise.all(toUpdate.slice(i, i + UPDATE_CONCURRENCY).map(r =>
        db.customer.update({ where: { freshsalesContactId: r.freshsalesContactId }, data: r.data })))
      updatedCustomers.push(...batch)
    }
    const updateRowsWithInquiry = toUpdate.filter(r => r.inquiry)
    if (updateRowsWithInquiry.length) {
      const existingInquiries = await db.inquiry.findMany({
        where: { customerId: { in: updatedCustomers.map(c => c.id) }, source: 'freshsales' },
        select: { customerId: true },
      })
      const hasInquirySet = new Set(existingInquiries.map(i => i.customerId))
      const idByFsId = new Map(updatedCustomers.map(c => [c.freshsalesContactId, c.id]))
      const inquiryRows = updateRowsWithInquiry
        .map(r => {
          const customerId = idByFsId.get(r.freshsalesContactId)
          if (!customerId || hasInquirySet.has(customerId) || !r.inquiry) return null
          const { createdAt, ...rest } = r.inquiry
          return { customerId, source: 'freshsales', ...rest, ...(createdAt ? { createdAt } : {}) }
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
      if (inquiryRows.length) await db.inquiry.createMany({ data: inquiryRows })
    }
    created = toCreate.length
    updated = toUpdate.length
  }

  const done = page > totalPages
  const nextPage = done ? null : page

  logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? 'Unknown',
    userRole: role,
    action: 'IMPORT', entity: target === 'lead' ? 'Lead' : 'Customer', entityId: viewId,
    detail: `Freshsales view ${viewId}: pages ${startPage}-${page - 1}/${totalPages} (${created} created, ${updated} updated, ${possibleMatches.length} flagged for review)`,
  }, db).catch(() => {})

  return NextResponse.json({
    ok: true, viewId, target, totalPages,
    fetchedThisBatch: batchContacts.length,
    created, updated, done, nextPage,
    possibleMatches,
  })
}
