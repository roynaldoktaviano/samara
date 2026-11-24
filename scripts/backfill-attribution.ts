/**
 * Marketing audit 2026-11-24 — backfill for data that existed before the new fields:
 *  1. Inquiry: normalised utm source/medium pairs (raw values stay in rawPayload; a medium that was
 *     really a campaign name moves to the empty campaign), acquisition brand, standard trip type.
 *     Only rows whose values change are written.
 *  2. DealAttribution — PER DEAL (a person's two deals can come from two different ads): each deal's
 *     window runs from the person's previous deal to its own Won / Lost; first touch, last paid ad
 *     click and Acquired / Assisted are computed with the live rule (src/lib/deal-attribution.ts).
 *     The person = their leads + guests sharing an email / E.164 + the linked Freshsales contacts.
 *  3. ERP-made deals: enquiry channel, booking type, enquiry trip type, amount in USD.
 *     (Freshsales-made deals get theirs from `npx tsx scripts/freshsales-erp-sync.ts apply`.)
 * Only creates DealAttribution rows that don't exist yet; `--recompute` also refreshes the window results
 * (last paid click, Acquired / Assisted) of existing rows — their first touch is never overwritten (except
 * by the same enquiry completing it); `--reset-first` (one-off correction) rewrites the first touch too.
 *
 * Run: npx tsx scripts/backfill-attribution.ts            (dry run)
 *      npx tsx scripts/backfill-attribution.ts --apply
 */
import { PrismaClient, type LeadStage, type Prisma } from '@prisma/client'
import { INQUIRY_SELECT, UTM_PAIRS, normalizeUtm } from '../src/lib/attribution-touch'
import {
  computeDealAttribution, dealAttributionData, dealClickId, earlierDealClickIds, freshsalesContactFirstTouch, inquiryEvents, previousDealAt, visitTouch, type TouchEvent,
} from '../src/lib/deal-attribution'
import { tripTypeFromText } from '../src/lib/deal-maker'
import { brandForInquiry } from '../src/lib/whatsapp-lead'
import { amountUsdFields, detectBookingType, enquiryChannelOf } from '../src/lib/deal-classify'

const db = new PrismaClient()
const APPLY = process.argv.includes('--apply')
type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }

async function main() {
  // ── 1. inquiries ──
  const inquiries = await db.inquiry.findMany({ select: { ...INQUIRY_SELECT, dealId: true }, orderBy: { createdAt: 'asc' } })
  const convBrand = new Map((await db.whatsappConversation.findMany({ select: { id: true, brand: true } })).map(c => [c.id, c.brand]))
  const inqUpdates: Json[] = []
  for (const i of inquiries) {
    const snap = () => JSON.stringify([...UTM_PAIRS.map(([a, b, c]) => [i[a], i[b], i[c]]), i.brand, i.tripTypeStd])
    const before = snap()
    for (const [sk, mk, ck] of UTM_PAIRS) {
      const n = normalizeUtm(i[sk], i[mk])
      if (n.campaignFromMedium && !i[ck]) i[ck] = n.campaignFromMedium
      i[sk] = n.source; i[mk] = n.medium
    }
    let host = i.website
    if (!host && i.url) { try { host = new URL(i.url).hostname } catch { host = null } }
    i.brand = i.brand ?? (i.whatsappConversationId ? convBrand.get(i.whatsappConversationId) ?? null : null) ?? (host || i.tripType ? brandForInquiry(host, i.tripType) : null)
    i.tripTypeStd = i.tripTypeStd ?? tripTypeFromText(i.tripType)
    if (snap() === before) continue
    inqUpdates.push({
      id: i.id, brand: i.brand, tripTypeStd: i.tripTypeStd,
      utmSource: i.utmSource, utmMedium: i.utmMedium, lastSource: i.lastSource, lastMedium: i.lastMedium, latestSource: i.latestSource, latestMedium: i.latestMedium,
      utmCampaign: i.utmCampaign, lastCampaign: i.lastCampaign, latestCampaign: i.latestCampaign,
    })
  }
  console.log(`Inquiries: ${inquiries.length} (${inqUpdates.length} to update)`)

  // ── 2. per-deal attribution ──
  // Person groups: leads + guests sharing an email / E.164 (union-find)
  const [leads, custs, deals] = await Promise.all([
    db.lead.findMany({ select: { id: true, email: true, phoneE164: true, freshsalesContactId: true } }),
    db.customer.findMany({ select: { id: true, email: true, phoneE164: true, freshsalesContactId: true } }),
    db.deal.findMany({
      where: { deletedAt: null },
      select: {
        id: true, createdAt: true, stage: true, stageUpdatedAt: true, leadId: true, customerId: true, freshsalesDealId: true,
        stageChanges: { where: { toStage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } }, orderBy: { changedAt: 'asc' }, take: 1, select: { changedAt: true } },
        attribution: { select: { id: true, firstInquiryId: true } },
      },
    }),
  ])
  const parent = new Map<string, string>()
  const find = (x: string): string => { let r = x; while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const p of [...leads.map(l => ({ k: `L:${l.id}`, ...l })), ...custs.map(c => ({ k: `C:${c.id}`, ...c }))]) {
    parent.set(p.k, parent.get(p.k) ?? p.k)
    if (p.email) { const e = `e:${p.email.trim().toLowerCase()}`; parent.set(e, parent.get(e) ?? e); union(p.k, e) }
    if (p.phoneE164) { const ph = `p:${p.phoneE164}`; parent.set(ph, parent.get(ph) ?? ph); union(p.k, ph) }
    if (p.freshsalesContactId) { const f = `F:${p.freshsalesContactId}`; parent.set(f, parent.get(f) ?? f); union(p.k, f) }
  }
  const groupOf = (leadId: string | null, customerId: string | null) => find(customerId ? `C:${customerId}` : `L:${leadId}`)

  const events = new Map<string, TouchEvent[]>()
  for (const i of inquiries) if (i.leadId || i.customerId) for (const e of inquiryEvents(i)) push(events, groupOf(i.leadId, i.customerId), e)
  const views = await db.$queryRaw<{ leadId: string | null; customerId: string | null; url: string; at: Date }[]>`
    SELECT "leadId", "customerId", url, "occurredAt" AS at FROM "PageView"
    WHERE ("leadId" IS NOT NULL OR "customerId" IS NOT NULL)`
  for (const v of views) { const t = visitTouch(v.url, v.at, 'PAGE_VIEW'); if (t) push(events, groupOf(v.leadId, v.customerId), { kind: 'visit', touch: t }) }

  const fsIds = [...new Set([...leads, ...custs].map(x => x.freshsalesContactId).filter((x): x is string => !!x))]
  const fsContacts = await db.freshsalesContact.findMany({ where: { id: { in: fsIds } }, select: { id: true, fsCreatedAt: true, raw: true } })
  for (const c of fsContacts) {
    const t = freshsalesContactFirstTouch(c)
    if (t) push(events, find(`F:${c.id}`), { kind: 'contact-first', touch: t })
  }
  const fsVisits = await db.$queryRaw<{ contact: string; at: Date; url: string }[]>`
    SELECT "contactFsId" AS contact, "occurredAt" AS at, "actionData"->>'property_value' AS url FROM "FreshsalesTimelineEvent"
    WHERE "actionType" = 'FM_PAGE_VIEWS' AND "contactFsId" = ANY(${fsIds}) AND "actionData"->>'property_value' IS NOT NULL`
  for (const v of fsVisits) { const t = visitTouch(v.url, v.at, 'FRESHSALES_WEB'); if (t) push(events, find(`F:${v.contact}`), { kind: 'visit', touch: t }) }

  // Deal timeline per person: ERP deals + every Freshsales deal of their contacts (Old Pipeline too)
  const dealTimes = new Map<string, number[]>()
  for (const d of deals) push(dealTimes, groupOf(d.leadId, d.customerId), +d.createdAt)
  const fsDeals = await db.freshsalesDeal.findMany({ where: { isDeleted: false, contactFsIds: { hasSome: fsIds } }, select: { id: true, contactFsIds: true, fsCreatedAt: true, customFields: true } })
  const fsDealClick = new Map<string, string>()
  const groupClicks = new Map<string, { at: number; id: string }[]>()
  for (const d of fsDeals) {
    const click = dealClickId(d.customFields)
    if (click) fsDealClick.set(d.id, click)
    if (!d.fsCreatedAt) continue
    for (const g of new Set(d.contactFsIds.filter(id => parent.has(`F:${id}`)).map(id => find(`F:${id}`)))) {
      push(dealTimes, g, +d.fsCreatedAt)
      if (click) push(groupClicks, g, { at: +d.fsCreatedAt, id: click })
    }
  }

  // --reset-first: one-off correction of first touches stored by the earlier (buggy) rules — Freshsales
  // contact fields patched with cf_utm_term, imported 'freshsales' inquiries taken as enquiries.
  const RESET_FIRST = process.argv.includes('--reset-first')
  const RECOMPUTE = RESET_FIRST || process.argv.includes('--recompute')
  const rows: Prisma.DealAttributionCreateManyInput[] = []
  const recompute: { dealId: string; data: Prisma.DealAttributionUncheckedUpdateInput }[] = []
  const tally: Record<string, number> = {}
  const CLOSED: LeadStage[] = ['CLOSED_WON', 'CLOSED_LOST']
  for (const d of deals) {
    if (d.attribution && !RECOMPUTE) continue
    const g = groupOf(d.leadId, d.customerId)
    const closedAt = CLOSED.includes(d.stage) ? d.stageChanges[0]?.changedAt ?? d.stageUpdatedAt ?? null : null
    const r = computeDealAttribution({
      dealId: d.id, createdAt: d.createdAt, closedAt,
      previousDealAt: previousDealAt(dealTimes.get(g) ?? [], d.createdAt),
      events: events.get(g) ?? [],
      clickIdLater: d.freshsalesDealId && fsDealClick.get(d.freshsalesDealId) ? { network: 'Google Ads', id: fsDealClick.get(d.freshsalesDealId)! } : null,
      earlierClickIds: earlierDealClickIds(groupClicks.get(g) ?? [], d.createdAt),
    })
    const key = `${r.role}${r.network ? ` ${r.network}` : ''}`
    tally[key] = (tally[key] ?? 0) + 1
    // An existing row keeps its first touch (never overwritten); only window results are recomputed
    // Live rule: the first touch is kept, unless the same enquiry completes it (or --reset-first)
    const setFirst = RESET_FIRST || (!!d.attribution?.firstInquiryId && d.attribution.firstInquiryId === r.firstInquiryId)
    if (d.attribution) recompute.push({ dealId: d.id, data: { ...dealAttributionData(r, true), setFirst } as Prisma.DealAttributionUncheckedUpdateInput })
    else rows.push({ ...(dealAttributionData(r, true) as Omit<Prisma.DealAttributionCreateManyInput, 'dealId'>), dealId: d.id })
  }
  console.log(`DealAttribution rows to create: ${rows.length}, to recompute: ${recompute.length}${RESET_FIRST ? ' (first touch reset)' : ''} — ${JSON.stringify(tally)}`)

  // ── 3. ERP-made deals ──
  const erpDeals = await db.deal.findMany({
    where: { channel: { notIn: ['FRESHSALES', 'MIGRATED'] } },
    select: { id: true, channel: true, leadId: true, customerId: true, createdAt: true, amount: true, currency: true, bookingType: true, enquiryChannel: true, enquiryTripType: true, amountUsd: true, inquiries: { select: { tripTypeStd: true, tripType: true }, orderBy: { createdAt: 'asc' } }, lead: { select: { entrySource: true } } },
  })
  const dealUpdates: { id: string; data: Prisma.DealUncheckedUpdateInput }[] = []
  for (const d of erpDeals) {
    const data: Prisma.DealUncheckedUpdateInput = {}
    const ch = d.enquiryChannel ?? enquiryChannelOf(d.channel, d.lead?.entrySource)
    if (!d.enquiryChannel && ch) data.enquiryChannel = ch
    if (!d.bookingType) data.bookingType = await detectBookingType(db, { leadId: d.leadId, customerId: d.customerId, enquiryChannel: ch, at: d.createdAt })
    const tt = d.inquiries.map(i => i.tripTypeStd ?? tripTypeFromText(i.tripType)).find(Boolean)
    if (!d.enquiryTripType && tt) data.enquiryTripType = tt
    if (d.amount != null && d.amountUsd == null) Object.assign(data, await amountUsdFields(db, d.amount, d.currency))
    if (Object.keys(data).length) dealUpdates.push({ id: d.id, data })
  }
  console.log(`ERP-made deals: ${erpDeals.length} (${dealUpdates.length} to classify)`)

  if (!APPLY) { console.log('\nDry run — pass --apply to write.'); return }

  for (let k = 0; k < inqUpdates.length; k += 1000) {
    const chunk = JSON.stringify(inqUpdates.slice(k, k + 1000))
    await db.$executeRaw`
      UPDATE "Inquiry" i SET
        brand = v.brand::"WhatsappBrand", "tripTypeStd" = v."tripTypeStd"::"TripType",
        "utmSource" = v."utmSource", "utmMedium" = v."utmMedium", "lastSource" = v."lastSource", "lastMedium" = v."lastMedium",
        "latestSource" = v."latestSource", "latestMedium" = v."latestMedium",
        "utmCampaign" = v."utmCampaign", "lastCampaign" = v."lastCampaign", "latestCampaign" = v."latestCampaign"
      FROM jsonb_to_recordset(${chunk}::jsonb) AS v(id text, brand text, "tripTypeStd" text, "utmSource" text, "utmMedium" text,
        "lastSource" text, "lastMedium" text, "latestSource" text, "latestMedium" text,
        "utmCampaign" text, "lastCampaign" text, "latestCampaign" text)
      WHERE i.id = v.id`
  }
  console.log('✓ inquiries updated')
  for (let k = 0; k < rows.length; k += 500) {
    await db.dealAttribution.createMany({ data: rows.slice(k, k + 500), skipDuplicates: true })
    if (k % 2500 === 0) console.log(`  … ${Math.min(k + 500, rows.length)}/${rows.length}`)
  }
  console.log('✓ deal attribution rows created')
  for (let k = 0; k < recompute.length; k += 500) {
    const chunk = JSON.stringify(recompute.slice(k, k + 500).map(r => ({ dealId: r.dealId, ...r.data })))
    await db.$executeRaw`
      UPDATE "DealAttribution" a SET
        "lastPaidNetwork" = v."lastPaidNetwork", "lastPaidSource" = v."lastPaidSource", "lastPaidMedium" = v."lastPaidMedium",
        "lastPaidCampaign" = v."lastPaidCampaign", "lastPaidTerm" = v."lastPaidTerm", "lastPaidContent" = v."lastPaidContent",
        "lastPaidLandingUrl" = v."lastPaidLandingUrl", "lastPaidGclid" = v."lastPaidGclid", "lastPaidGbraid" = v."lastPaidGbraid",
        "lastPaidWbraid" = v."lastPaidWbraid", "lastPaidFbclid" = v."lastPaidFbclid", "lastPaidCtwaClid" = v."lastPaidCtwaClid",
        "lastPaidBrand" = v."lastPaidBrand"::"WhatsappBrand", "lastPaidAt" = v."lastPaidAt"::timestamp, "lastPaidOrigin" = v."lastPaidOrigin",
        "adRole" = v."adRole", "adNetwork" = v."adNetwork", "adEvidence" = v."adEvidence", "updatedAt" = now(),
        "firstSource" = CASE WHEN v."setFirst" THEN v."firstSource" ELSE a."firstSource" END,
        "firstMedium" = CASE WHEN v."setFirst" THEN v."firstMedium" ELSE a."firstMedium" END,
        "firstCampaign" = CASE WHEN v."setFirst" THEN v."firstCampaign" ELSE a."firstCampaign" END,
        "firstTerm" = CASE WHEN v."setFirst" THEN v."firstTerm" ELSE a."firstTerm" END,
        "firstContent" = CASE WHEN v."setFirst" THEN v."firstContent" ELSE a."firstContent" END,
        "firstLandingUrl" = CASE WHEN v."setFirst" THEN v."firstLandingUrl" ELSE a."firstLandingUrl" END,
        "firstReferrer" = CASE WHEN v."setFirst" THEN v."firstReferrer" ELSE a."firstReferrer" END,
        "firstGclid" = CASE WHEN v."setFirst" THEN v."firstGclid" ELSE a."firstGclid" END,
        "firstGbraid" = CASE WHEN v."setFirst" THEN v."firstGbraid" ELSE a."firstGbraid" END,
        "firstWbraid" = CASE WHEN v."setFirst" THEN v."firstWbraid" ELSE a."firstWbraid" END,
        "firstFbclid" = CASE WHEN v."setFirst" THEN v."firstFbclid" ELSE a."firstFbclid" END,
        "firstOrigin" = CASE WHEN v."setFirst" THEN v."firstOrigin" ELSE a."firstOrigin" END,
        "firstInquiryId" = CASE WHEN v."setFirst" THEN v."firstInquiryId" ELSE a."firstInquiryId" END,
        "firstBrand" = CASE WHEN v."setFirst" THEN v."firstBrand"::"WhatsappBrand" ELSE a."firstBrand" END,
        "firstAt" = CASE WHEN v."setFirst" THEN v."firstAt"::timestamp ELSE a."firstAt" END
      FROM jsonb_to_recordset(${chunk}::jsonb) AS v("dealId" text, "lastPaidNetwork" text, "lastPaidSource" text, "lastPaidMedium" text,
        "lastPaidCampaign" text, "lastPaidTerm" text, "lastPaidContent" text, "lastPaidLandingUrl" text, "lastPaidGclid" text,
        "lastPaidGbraid" text, "lastPaidWbraid" text, "lastPaidFbclid" text, "lastPaidCtwaClid" text, "lastPaidBrand" text,
        "lastPaidAt" text, "lastPaidOrigin" text, "adRole" text, "adNetwork" text, "adEvidence" text,
        "firstSource" text, "firstMedium" text, "firstCampaign" text, "firstTerm" text, "firstContent" text, "firstLandingUrl" text, "firstReferrer" text, "firstGclid" text, "firstGbraid" text, "firstWbraid" text, "firstFbclid" text, "firstOrigin" text, "firstInquiryId" text, "firstBrand" text, "firstAt" text, "setFirst" boolean)
      WHERE a."dealId" = v."dealId"`
  }
  if (recompute.length) console.log(`✓ ${recompute.length} deal attribution rows recomputed`)
  for (const u of dealUpdates) await db.deal.update({ where: { id: u.id }, data: u.data })
  console.log('✓ deals classified')
}
main().finally(() => db.$disconnect())
