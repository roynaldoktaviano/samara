import type { LeadDistributionChannel, LeadStage, Prisma, PrismaClient, TripType, WhatsappBrand } from '@prisma/client'
import { sendPushToUser } from '@/lib/push'
import { pickNextSalesUserId } from '@/lib/whatsapp-distribution'
import { isSalesUserStillEmployed } from '@/lib/sales-availability'
import { normalizeEmail } from '@/lib/contact-identity'
import { TRIP_TYPE_NAME } from '@/lib/deal-name'

/**
 * Deal maker — the ERP's version of Freshsales snippet 92 (go-live parity checklist, section B).
 * Every enquiry (website form, Meta Instant Form, a new WhatsApp / Instagram / Messenger contact,
 * a manually added lead) runs through runDealMaker for its person (Lead, or a Guest who enquires
 * again):
 *
 *   1. An OPEN deal of the same brand + trip type exists → the enquiry joins it: a note on the
 *      deal and, for a real enquiry (form / ad / website WhatsApp tap), a "follow up within 4h"
 *      task + notification for its owner. A deal opened < 15 min ago is the same submission
 *      arriving twice (double click, form + WhatsApp) → only its empty fields are filled.
 *   2. Else a deal made for this person in the last 15 min (any brand, same trip type) → same
 *      submission, fill empty fields only.
 *   3. Else a NEW deal in New Enquiry. Owner = the contact owner (even when Away / on leave — only a
 *      resigned / inactive owner is skipped), else round-robin of the brand's pool skipping anyone
 *      away / on leave / resigned (sales-availability.ts).
 *
 * Won and Lost deals are never touched (read-only). Callers hold the per-contact advisory lock
 * (contactLockKeys) for the whole call, so two enquiries from one person never make two deals.
 * Writes happen on `db` (a transaction client is fine); pushes are returned for the caller to
 * send after commit (flushDealPushes).
 */

export type Db = PrismaClient | Prisma.TransactionClient

export const OPEN_STAGES: LeadStage[] = ['NEW', 'INITIAL_MESSAGE_SENT', 'ACTIVE_COMMUNICATION', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'BOOKING_CONFIRMATION', 'INVOICE_SENT']
export const CLOSED_STAGES: LeadStage[] = ['CLOSED_WON', 'CLOSED_LOST']
export const isClosedDealStage = (s: LeadStage) => s === 'CLOSED_WON' || s === 'CLOSED_LOST'

/** Same-submission window (Freshsales deal maker: 900 s). */
export const SAME_SUBMIT_MS = 15 * 60 * 1000
/** Follow-up task deadline for the owner of an open deal that gets a new enquiry. */
export const REENQUIRY_TASK_MS = 4 * 60 * 60 * 1000

export type DealChannel = 'WEBSITE_FORM' | 'META_FORM' | 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'EMAIL' | 'MANUAL' | 'BOOKING' | 'FRESHSALES' | 'MIGRATED'

export const DEAL_CHANNEL_LABEL: Record<DealChannel, string> = {
  WEBSITE_FORM: 'website form', META_FORM: 'Meta Instant Form', WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger', EMAIL: 'email', MANUAL: 'manual entry', BOOKING: 'booking', FRESHSALES: 'Freshsales', MIGRATED: 'migration',
}

const DISTRIBUTION_CHANNEL: Record<DealChannel, LeadDistributionChannel> = {
  WEBSITE_FORM: 'WEBSITE', META_FORM: 'WEBSITE', WHATSAPP: 'WHATSAPP', INSTAGRAM: 'INSTAGRAM', MESSENGER: 'INSTAGRAM',
  EMAIL: 'EMAIL', MANUAL: 'WEBSITE', BOOKING: 'WEBSITE', FRESHSALES: 'WEBSITE', MIGRATED: 'WEBSITE',
}

/**
 * Private Charter / Open Trip from what the form or ad says. Vocabulary seen on the three sites:
 * "Private Charter (#SL)", "Open Trip (#SL)", "Last Minute Offer (#SL)" (open-trip cabins),
 * "6D5N / Central Raja Ampat" (open-trip schedule form), "OTIUM - Komodo", "Mischief (#SL)",
 * "Private Charter (#MC)", "Tailor-Made Voyage / …", "Family & Friends". Otium / Mischief are
 * charter yachts, except Otium "Signature" voyages (sold per cabin) = Open Trip (Jay, 20 Nov).
 * Unknown → null, which matches any open deal (sales set it before AC).
 */
export function tripTypeFromText(text: string | null | undefined): TripType | null {
  const t = (text ?? '').toLowerCase()
  if (!t.trim()) return null
  if (/signature|open\s*trip|last\s*minute|shared|\b\d+\s*d\s*\d+\s*n\b|\b(ot|sv)\s*\/|^(ot|sv)\b/.test(t)) return 'OPEN_TRIP'
  if (/private|charter|tailor|family\s*&?\s*friends|\bpc\b|otium|mischief/.test(t)) return 'PRIVATE_CHARTER'
  return null
}

/** Advisory-lock keys for one person — the same keys in every intake path (form, Meta, chats). */
export function contactLockKeys(email: string | null | undefined, phoneE164: string | null | undefined): string[] {
  const e = normalizeEmail(email)
  return [e && `contact:email:${e}`, phoneE164 && `contact:phone:${phoneE164}`].filter((k): k is string => !!k).sort()
}

export async function lockContact(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

/** "ERP-1042" — never numeric, so an ERP Order ID can't collide with a Freshsales deal ID. */
export async function nextDealOrderId(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES ('deal_order_id', 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`
  return `ERP-${rows[0]?.value ?? Date.now()}`
}

export interface PushNotice { userId: string; title: string; body: string }

export async function flushDealPushes(db: PrismaClient, pushes: PushNotice[]) {
  for (const p of pushes) await sendPushToUser(db, p.userId, { title: p.title, body: p.body, url: '/' }).catch(() => {})
}

/** Every lead / guest id that is this same person (exact email or E.164), incl. archived leads. */
async function personIds(db: Db, p: { leadId?: string | null; customerId?: string | null }) {
  const [lead, cust] = await Promise.all([
    p.leadId ? db.lead.findUnique({ where: { id: p.leadId }, select: { id: true, email: true, phoneE164: true, ownerId: true, name: true, deletedAt: true } }) : null,
    p.customerId ? db.customer.findUnique({ where: { id: p.customerId }, select: { id: true, email: true, phoneE164: true, ownerId: true, name: true } }) : null,
  ])
  const email = normalizeEmail(lead?.email ?? cust?.email)
  const phone = lead?.phoneE164 ?? cust?.phoneE164 ?? null
  const ident: Prisma.LeadWhereInput[] = [
    ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
    ...(phone ? [{ phoneE164: phone }] : []),
  ]
  const [leads, custs] = await Promise.all([
    ident.length ? db.lead.findMany({ where: { OR: ident }, select: { id: true, ownerId: true, deletedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }) : [],
    ident.length ? db.customer.findMany({ where: { deletedAt: null, OR: ident as Prisma.CustomerWhereInput[] }, select: { id: true, ownerId: true }, take: 20 }) : [],
  ])
  const leadIds = [...new Set([...(lead ? [lead.id] : []), ...leads.map(l => l.id)])]
  const customerIds = [...new Set([...(cust ? [cust.id] : []), ...custs.map(c => c.id)])]
  // The lead the deal card hangs on: the given one, else the person's newest live lead, else newest archived.
  const cardLeadId = lead?.id ?? leads.find(l => !l.deletedAt)?.id ?? leads[0]?.id ?? null
  // Contact owner: the guest's owner (handles the person now), else the lead's.
  const contactOwnerId = cust?.ownerId ?? lead?.ownerId ?? custs.find(c => c.ownerId)?.ownerId ?? leads.find(l => l.ownerId && !l.deletedAt)?.ownerId ?? null
  return { leadIds, customerIds, cardLeadId, contactOwnerId, name: lead?.name ?? cust?.name ?? 'Unknown', cardLeadOwnerId: lead?.ownerId ?? leads.find(l => l.id === cardLeadId)?.ownerId ?? null }
}

export interface DealMakerInput {
  leadId?: string | null
  customerId?: string | null
  brand: WhatsappBrand
  tripType: TripType | null
  channel: DealChannel
  /** A real enquiry (form, ad, website WhatsApp tap) — joining an open deal also gives its owner a 4h task. */
  enquiry: boolean
  inquiryId?: string | null
  /** One line for the deal timeline, e.g. "Open Trip (#SL) · 2 pax · 12 Mar 2027 · <message>". */
  summary?: string | null
  travelStartDate?: Date | null
  travelEndDate?: Date | null
  guestCount?: number | null
  /** Yacht ("Samara I" …) — inferDealYacht() in src/lib/deal-product-interest.ts. */
  productInterest?: string | null
  actingUserId?: string | null
  /** Stage for a NEW deal (a chat whose first staff reply already happened, a manual lead). */
  initialStage?: LeadStage
  at?: Date
}

export type DealMakerResult = { dealId: string; action: 'created' | 'joined' | 'merged'; ownerId: string | null; pushes: PushNotice[] }

const dealLabel = (name: string, tripType: TripType | null) => [tripType ? TRIP_TYPE_NAME[tripType] : null, name].filter(Boolean).join(' · ')

export async function runDealMaker(db: Db, input: DealMakerInput): Promise<DealMakerResult> {
  const at = input.at ?? new Date()
  const pushes: PushNotice[] = []
  const person = await personIds(db, input)
  const personWhere: Prisma.DealWhereInput = {
    deletedAt: null,
    OR: [
      ...(person.leadIds.length ? [{ leadId: { in: person.leadIds } }] : []),
      ...(person.customerIds.length ? [{ customerId: { in: person.customerIds } }] : []),
    ],
  }
  if (!personWhere.OR!.length) throw new Error('runDealMaker: no person')

  const deals = await db.deal.findMany({
    where: personWhere,
    select: { id: true, stage: true, tripType: true, brand: true, ownerId: true, createdAt: true, travelStartDate: true, travelEndDate: true, guestCount: true, productInterest: true, leadId: true, customerId: true },
    orderBy: { createdAt: 'desc' },
  })
  const open = deals.filter(d => !isClosedDealStage(d.stage))
  const sameType = (d: { tripType: TripType | null }) => !input.tripType || !d.tripType || d.tripType === input.tripType
  // Exact type first, then an untyped one
  const match = open.filter(d => d.brand === input.brand && sameType(d))
    .sort((a, b) => Number(b.tripType === input.tripType) - Number(a.tripType === input.tripType) || +b.createdAt - +a.createdAt)[0]
  // Same submission arriving twice (form + WhatsApp, double click): any brand — a site's button may open
  // another brand's number — but the same trip type, so a PC and an OT request stay two deals (snippet 92).
  const recent = deals.find(d => at.getTime() - d.createdAt.getTime() < SAME_SUBMIT_MS && !isClosedDealStage(d.stage) && sameType(d))

  const fillEmpty = async (d: typeof deals[number]) => {
    const data: Prisma.DealUncheckedUpdateInput = {}
    if (!d.tripType && input.tripType) data.tripType = input.tripType
    if (!d.travelStartDate && input.travelStartDate) data.travelStartDate = input.travelStartDate
    if (!d.travelEndDate && input.travelEndDate) data.travelEndDate = input.travelEndDate
    if (d.guestCount == null && input.guestCount) data.guestCount = input.guestCount
    if (!d.productInterest && input.productInterest) data.productInterest = input.productInterest
    if (!d.customerId && input.customerId) data.customerId = input.customerId
    if (!d.leadId && person.cardLeadId) data.leadId = person.cardLeadId
    if (Object.keys(data).length) await db.deal.update({ where: { id: d.id }, data })
    if (input.inquiryId) await db.inquiry.update({ where: { id: input.inquiryId }, data: { dealId: d.id } })
  }

  const via = DEAL_CHANNEL_LABEL[input.channel]
  const target = match ?? recent
  if (target) {
    await fillEmpty(target)
    const sameSubmit = at.getTime() - target.createdAt.getTime() < SAME_SUBMIT_MS
    if (sameSubmit) return { dealId: target.id, action: 'merged', ownerId: target.ownerId, pushes }

    await db.dealNote.create({
      data: { dealId: target.id, kind: 'ENQUIRY', body: `${input.enquiry ? 'Enquired again' : 'Contacted again'} via ${via}${input.summary ? ` — ${input.summary}` : ''}`.slice(0, 4000), createdById: input.actingUserId ?? null, createdAt: at },
    })
    if (input.enquiry && target.ownerId) {
      const label = dealLabel(person.name, target.tripType ?? input.tripType)
      const title = `Follow up within 4h: ${label} enquired again`
      const body = `New enquiry via ${via} on an open deal${input.summary ? ` — ${input.summary}` : ''}`.slice(0, 1000)
      await db.todo.create({
        data: { userId: target.ownerId, title: title.slice(0, 300), notes: body, type: 'Sales Pipeline', priority: 'HIGH', dueDate: new Date(at.getTime() + REENQUIRY_TASK_MS), dealId: target.id },
      })
      await db.notification.create({ data: { userId: target.ownerId, type: 'DEAL_ENQUIRY', title: title.slice(0, 300), body } })
      pushes.push({ userId: target.ownerId, title, body })
    }
    return { dealId: target.id, action: 'joined', ownerId: target.ownerId, pushes }
  }

  // ── new deal ──
  let ownerId: string | null = null
  // Contact owner even when Away / on leave today (Freshsales rule, Marc 14 Nov); only a resigned /
  // inactive owner falls back to round-robin — the pool itself skips Away / leave / resigned reps.
  if (person.contactOwnerId && await isSalesUserStillEmployed(db as PrismaClient, person.contactOwnerId, at)) ownerId = person.contactOwnerId
  if (!ownerId) {
    const ch = DISTRIBUTION_CHANNEL[input.channel]
    ownerId = await pickNextSalesUserId(db as PrismaClient, input.brand, ch)
      ?? (input.brand !== 'SAMARA' ? await pickNextSalesUserId(db as PrismaClient, 'SAMARA', ch) : null)
  }
  const deal = await db.deal.create({
    data: {
      orderId: await nextDealOrderId(db),
      leadId: person.cardLeadId,
      customerId: input.customerId ?? person.customerIds[0] ?? null,
      brand: input.brand,
      tripType: input.tripType,
      stage: input.initialStage ?? 'NEW',
      stageUpdatedAt: at,
      stageUpdatedById: input.actingUserId ?? null,
      ownerId,
      ownerAssignedAt: ownerId ? at : null,
      travelStartDate: input.travelStartDate ?? null,
      travelEndDate: input.travelEndDate ?? null,
      guestCount: input.guestCount ?? null,
      productInterest: input.productInterest ?? null,
      channel: input.channel,
      createdAt: at,
    },
    select: { id: true },
  })
  if (input.inquiryId) await db.inquiry.update({ where: { id: input.inquiryId }, data: { dealId: deal.id } })
  if (input.summary) await db.dealNote.create({ data: { dealId: deal.id, kind: 'ENQUIRY', body: `New enquiry via ${via} — ${input.summary}`.slice(0, 4000), createdAt: at } })

  // The lead's Yacht field (deal name, lead sheet) takes the enquiry's yacht when it has none.
  if (input.productInterest && person.cardLeadId) {
    await db.lead.updateMany({ where: { id: person.cardLeadId, productInterest: null }, data: { productInterest: input.productInterest } })
  }
  // The lead takes the deal owner when it has none yet (its chats follow the lead owner).
  if (ownerId && person.cardLeadId && !person.cardLeadOwnerId) {
    const { count } = await db.lead.updateMany({ where: { id: person.cardLeadId, ownerId: null }, data: { ownerId, ownerAssignedAt: at } })
    if (count) await db.leadAssignmentLog.create({ data: { leadId: person.cardLeadId, toUserId: ownerId, reason: 'AUTO_DISTRIBUTION' } })
  }
  if (ownerId && ownerId !== input.actingUserId) {
    const title = `New enquiry: ${dealLabel(person.name, input.tripType)}`
    const body = `via ${via}${input.summary ? ` — ${input.summary}` : ''}`.slice(0, 1000)
    await db.notification.create({ data: { userId: ownerId, type: 'LEAD_ASSIGNED', title: title.slice(0, 300), body } })
    pushes.push({ userId: ownerId, title, body })
  }
  return { dealId: deal.id, action: 'created', ownerId, pushes }
}

/**
 * Deal maker for paths that aren't already inside a locked transaction (chats, manual entry):
 * takes the person's advisory lock, runs, commits, then sends the pushes. Best-effort callers
 * should .catch() it.
 */
export async function runDealMakerLocked(db: PrismaClient, input: DealMakerInput): Promise<DealMakerResult> {
  const ident = input.leadId
    ? await db.lead.findUnique({ where: { id: input.leadId }, select: { email: true, phoneE164: true } })
    : input.customerId ? await db.customer.findUnique({ where: { id: input.customerId }, select: { email: true, phoneE164: true } }) : null
  const keys = contactLockKeys(ident?.email, ident?.phoneE164)
  // A chat lead with neither email nor phone (Instagram) locks on its own id.
  if (!keys.length) keys.push(`contact:lead:${input.leadId ?? input.customerId}`)
  const result = await db.$transaction(async tx => {
    await lockContact(tx, keys)
    return runDealMaker(tx, input)
  }, { timeout: 20000 })
  await flushDealPushes(db, result.pushes)
  return result
}

/** One-line summary of an enquiry for the deal timeline. */
export function enquirySummary(p: { tripType?: string | null; guestCount?: number | null; checkIn?: Date | null; checkOut?: Date | null; message?: string | null }): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return [
    p.tripType?.trim() || null,
    p.guestCount ? `${p.guestCount} pax` : null,
    p.checkIn ? `${fmt(p.checkIn)}${p.checkOut ? ` → ${fmt(p.checkOut)}` : ''}` : null,
    p.message?.replace(/\s+/g, ' ').trim().slice(0, 300) || null,
  ].filter(Boolean).join(' · ')
}
