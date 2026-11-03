// ERP-backed datasets for the Marketing Intelligence dashboard (public/marketing-dashboard),
// built in the dashboard's own column format (see public/marketing-dashboard/datasets.js).
//
// Source tenant: the default DB (Samara Yachting) — the dashboard has no login yet.
//  - leads: one row per Freshsales deal (the real sales funnel; ERP Lead rows only mirror
//    Freshsales contacts), joined through its contact to the nearest ERP Inquiry (trip date,
//    trip type, UTM) and, for won deals, to the guest's ERP Booking (yacht, destination,
//    departure, value). Deals of the Agent Outreach pipeline are B2B outreach, not enquiries.
//  - trips: open trips plus private-charter bookings.
// Nothing personal leaves here: no names, emails, phones or free-text notes.
import { db, withRetry } from '@/lib/db'

type Row = Record<string, string | number | null>

const DAY = 864e5
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

const EUROPE = new Set(['United Kingdom', 'Germany', 'France', 'Switzerland', 'Italy', 'Netherlands', 'Spain', 'Belgium', 'Austria', 'Sweden', 'Denmark', 'Norway', 'Finland', 'Ireland', 'Portugal', 'Poland', 'Czech Republic', 'Czechia', 'Luxembourg', 'Greece', 'Hungary', 'Iceland', 'Monaco'])

// Freshsales and the ERP spell some countries differently; the dashboard groups markets by exact name
const COUNTRY_ALIAS: Record<string, string> = {
  ID: 'Indonesia', IN: 'India', SG: 'Singapore', MY: 'Malaysia', AU: 'Australia', US: 'United States', USA: 'United States', UK: 'United Kingdom', GB: 'United Kingdom',
  'Hong Kong SAR China': 'Hong Kong', 'The Netherlands': 'Netherlands', Czechia: 'Czech Republic', 'United States of America': 'United States',
}
const normCountry = (c: string | null | undefined) => { const v = (c ?? '').trim(); return v ? COUNTRY_ALIAS[v] ?? v : null }

export function normDestination(s: string | null | undefined): string {
  const v = lower(s)
  if (!v) return 'Unspecified'
  if (v.includes('spice')) return 'Spice Islands'
  if (v.includes('raja')) return 'Raja Ampat'
  if (v.includes('komodo')) return 'Komodo'
  if (v.includes('sumbawa')) return 'Sumbawa'
  return (s ?? '').trim()
}

function yachtFrom(product: string | null, feedback: string | null, website: string | null, tripType: string | null): string {
  const p = lower(product), f = lower(feedback), w = lower(website), t = lower(tripType)
  if (/\bs1\b/.test(p)) return 'Samara I'
  if (/\bs2\b/.test(p)) return 'Samara II'
  if (p.includes('mischief')) return 'Mischief'
  if (p.includes('otium')) return 'Otium'
  if (/mischief|^mv$/.test(f)) return 'Mischief'
  if (f.includes('otium')) return 'Otium'
  if (/samara ?(2|ii)\b/.test(f)) return 'Samara II'
  if (/samara ?(1|i)\b/.test(f)) return 'Samara I'
  if (w.includes('mischief')) return 'Mischief'
  if (w.includes('otium')) return 'Otium'
  if (t.includes('mischief')) return 'Mischief'
  if (t.includes('otium')) return 'Otium'
  if (/samara i\b/.test(t)) return 'Samara I'
  // Samara I is the only yacht running open trips
  if (/open trip|last minute/.test(t)) return 'Samara I'
  return 'Unassigned'
}

function voyageFrom(product: string | null, tripType: string | null): string {
  const p = lower(product), t = lower(tripType)
  if (/^ot\b|open trip/.test(p)) return 'Cabin charter'
  if (/^pc\b|private/.test(p)) return 'Private charter'
  if (/div/.test(t)) return 'Dive expedition'
  if (/open trip|last minute/.test(t)) return 'Cabin charter'
  if (/private|charter|leisure/.test(t)) return 'Private charter'
  return 'Unspecified'
}

function channelFrom(src: string, med: string, mediumCustom: string, gclid: boolean, fbclid: boolean, inquirySource: string | null): string {
  const s = lower(src), m = lower(med), mc = lower(mediumCustom)
  if (inquirySource === 'META_LEAD_AD') return 'Meta Ads'
  if (gclid || /google-ads|goolge-ads|adwords/.test(s) || /^google\|/.test(m) || (/google/.test(s) && /cpc|paid|ads|lead/.test(m))) return 'Google Ads'
  if (fbclid || /meta-ads/.test(s) || (/^(fb|ig|an|meta|facebook|instagram)\b/.test(s) && /paid|cpc|lead|ads/.test(m))) return 'Meta Ads'
  if (/organic search/.test(m) || /^(google|bing|yahoo|duckduckgo|ecosia|search\.brave|chatgpt|copilot|perplexity)/.test(s) || /^(google|bing|yahoo|duckduckgo|www\.ecosia)/.test(mc)) return 'Organic search'
  if (/social/.test(m) || /facebook|instagram|linktr|youtube|reddit/.test(s) || /facebook|instagram|linktr|youtube|^ig$/.test(mc)) return 'Organic social'
  if (/newsletter|email/.test(s + ' ' + m)) return 'Email newsletter'
  if (/direct|referral/.test(s + ' ' + m) || /word of mouth|^wa$|phone/.test(mc)) return 'Direct / referral'
  return 'Unattributed'
}

const FIRST_TOUCH: Record<string, string> = {
  'Google Ads': 'Google search', 'Organic search': 'Google search', 'Meta Ads': 'Facebook', 'Organic social': 'Instagram',
  'Direct / referral': 'Direct', 'Email newsletter': 'Newsletter', Unattributed: 'Unknown',
}

// Freshsales lost reasons in the dashboard's vocabulary (its "lost" calc groups them by these words)
function lostReason(r: string | null): string | null {
  const v = lower(r)
  if (!v) return null
  if (v.includes('price')) return 'Price'
  if (v.includes('inventory') || v.includes('date')) return 'Dates unavailable'
  if (v.includes('rival')) return 'Booked another yacht'
  if (v.includes('future')) return 'Postponed'
  if (v.includes('junk')) return 'Junk lead'
  if (v.includes('requirement')) return 'No requirement'
  return (r ?? '').trim()
}

// Stage names (all pipelines) that mean the guest engaged, and that a price/proposal was on the table
const REPLIED_STAGE = /active communication|responsive|nego|quote|proposal|invoice|booking confirm|verbally|won/i
const PROPOSAL_STAGE = /nego|quote|proposal|invoice|booking confirm|verbally/i
const FIRST_MESSAGE_STAGE = /initial message|active communication|responsive|follow|nego|quote/i

interface DealRow {
  id: string; created: Date | null; closed: Date | null; amount: number | null; stage: string; ft: string | null; pipeline: string | null
  lost_reason: string | null; contact_id: string | null; product: string | null; quality: string | null; utm_source: string | null
  utm_medium: string | null; utm_campaign: string | null; medium: string | null; feedback: string | null; guests: string | null; reach: string | null
}
interface ContactRow { id: string; country: string | null; leadId: string | null; customerId: string | null; nationality: string | null; em: string | null }
interface InquiryRow {
  leadId: string | null; customerId: string | null; createdAt: Date; checkInDate: Date | null; tripType: string | null; guestCount: number | null
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; gclid: string | null; fbclid: string | null; source: string; website: string | null
  form_destination: string | null; form_trip: string | null
}
interface StageEvent { deal: string; at: Date; stage: string | null }
interface Engagement { contact: string; page_views: number; email_opens: number }
interface BookingRow {
  id: string; customerId: string; openTripId: string | null; tripType: string; status: string; startDate: Date; endDate: Date; totalPrice: number
  discount: number; guestCount: number; createdAt: Date; updatedAt: Date; yacht: string | null; cabins: number | null; dest: string | null; em: string | null
}
interface OpenTripRow { id: string; yacht: string; startDate: Date; endDate: Date; maxCapacity: number; dest: string | null }

const nearest = <T>(list: T[] | undefined, at: number, time: (x: T) => number, maxDays: number) => {
  let best: T | undefined, bd = maxDays * DAY
  for (const x of list ?? []) { const d = Math.abs(time(x) - at); if (d <= bd) { bd = d; best = x } }
  return best
}

const groupBy = <T>(list: T[], key: (x: T) => string | null) => {
  const m = new Map<string, T[]>()
  for (const x of list) { const k = key(x); if (!k) continue; const a = m.get(k); if (a) a.push(x); else m.set(k, [x]) }
  return m
}

async function loadBookings() {
  return db.$queryRaw<BookingRow[]>`
    select b.id, b."customerId", b."openTripId", b."tripType"::text, b.status::text, b."startDate", b."endDate", b."totalPrice", b.discount,
           b."guestCount", b."createdAt", b."updatedAt", y.name yacht, y."cabinCount" cabins, coalesce(d.name, b.destination) dest,
           nullif(lower(trim(cu.email)), '') em
    from "Booking" b left join "Yacht" y on y.id = b."yachtId" left join "Destination" d on d.id = b."destinationId"
    left join "Customer" cu on cu.id = b."customerId"`
}

export async function buildLeads(): Promise<Row[]> {
  const [deals, contacts, inquiries, stageEvents, engagement, bookings] = await withRetry(db, () => Promise.all([
    db.$queryRaw<DealRow[]>`
      select d.id, d."fsCreatedAt" created, d."closedDate" closed, d."baseCurrencyAmount" amount, s.name stage, s.extra->>'forecast_type' ft,
             p.name pipeline, r.name lost_reason, d."contactFsIds"[1] contact_id,
             d."customFields"->>'cf_product_interest' product, d."customFields"->>'cf_marketing_feedback__lead_quality' quality,
             d."customFields"->>'cf_utm_source' utm_source, d."customFields"->>'cf_utm_medium' utm_medium, d."customFields"->>'cf_utm_campaign' utm_campaign,
             d."customFields"->>'cf_mediumcustom' medium, d."customFields"->>'cf_marketing_feedback' feedback,
             d."customFields"->>'cf_number_of_guestss' guests, d."customFields"->>'cf_reach_out_by' reach
      from "FreshsalesDeal" d
      join "FreshsalesLookup" s on s.kind = 'DEAL_STAGE' and s."fsId" = d."stageFsId"
      left join "FreshsalesLookup" p on p.kind = 'DEAL_PIPELINE' and p."fsId" = s."parentFsId"
      left join "FreshsalesLookup" r on r.kind = 'DEAL_REASON' and r."fsId" = d."lostReasonFsId"
      where not d."isDeleted" and d."fsCreatedAt" is not null and coalesce(p.name, '') <> 'Agent Outreach Pipeline'`,
    db.$queryRaw<ContactRow[]>`
      select c.id, nullif(c.raw->>'country', '') country, c."leadId", c."customerId", l.nationality,
             nullif(lower(trim(coalesce(c.email, l.email))), '') em
      from "FreshsalesContact" c left join "Lead" l on l.id = c."leadId"`,
    db.$queryRaw<InquiryRow[]>`
      select "leadId", "customerId", "createdAt", "checkInDate", "tripType", "guestCount", "utmSource", "utmMedium", "utmCampaign", gclid, fbclid, source, website,
             nullif("rawPayload"->>'cf_destination', '') form_destination, nullif("rawPayload"->>'field_TripType', '') form_trip
      from "Inquiry" where "leadId" is not null or "customerId" is not null`,
    db.$queryRaw<StageEvent[]>`
      select "targetFsId" deal, "occurredAt" at, "actionData"->>'stage_name' stage
      from "FreshsalesTimelineEvent" where "actionType" = 'STAGE_CHANGE' and "targetFsId" is not null order by "occurredAt"`,
    db.$queryRaw<Engagement[]>`
      select "contactFsId" contact,
             coalesce(sum(case when "actionType" = 'FM_PAGE_VIEWS' then coalesce(("actionData"->>'count')::int, 1) end), 0)::int page_views,
             count(*) filter (where "actionType" = 'FM_OPENED_JOURNEY_EMAIL')::int email_opens
      from "FreshsalesTimelineEvent" where "contactFsId" is not null and "actionType" in ('FM_PAGE_VIEWS', 'FM_OPENED_JOURNEY_EMAIL')
      group by 1`,
    loadBookings(),
  ]))

  const contactById = new Map(contacts.map(c => [c.id, c]))
  const inqByLead = groupBy(inquiries, i => i.leadId), inqByCustomer = groupBy(inquiries, i => i.customerId)
  const stagesByDeal = groupBy(stageEvents, e => e.deal)
  const engByContact = new Map(engagement.map(e => [e.contact, e]))
  const bookingsByCustomer = groupBy(bookings, b => b.customerId), bookingsByEmail = groupBy(bookings, b => b.em)
  const cabinsByYacht = new Map(bookings.filter(b => b.yacht).map(b => [b.yacht as string, b.cabins ?? 0]))
  // A yacht whose whole ERP schedule sails one destination (Samara I and II: Komodo) gives its leads that destination
  const destsByYacht = new Map<string, Set<string>>()
  for (const t of await buildTrips()) {
    const s = destsByYacht.get(String(t.brand)) ?? new Set<string>(); if (t.destination !== 'Unspecified') s.add(String(t.destination)); destsByYacht.set(String(t.brand), s)
  }
  const yachtDestination = (yacht: string) => { const s = destsByYacht.get(yacht); return s && s.size === 1 ? [...s][0] : 'Unspecified' }

  // A deal is a repeat guest's when the same contact already had a won deal before it was created
  const wonAt = new Map<string, number[]>()
  for (const d of deals) if (d.ft === 'Closed Won' && d.contact_id) {
    const a = wonAt.get(d.contact_id) ?? []; a.push((d.closed ?? d.created as Date).getTime()); wonAt.set(d.contact_id, a)
  }

  const rows: Row[] = []
  for (const d of deals) {
    const created = (d.created as Date).getTime()
    const contact = d.contact_id ? contactById.get(d.contact_id) : undefined
    const inqList = [...(contact?.leadId ? inqByLead.get(contact.leadId) ?? [] : []), ...(contact?.customerId ? inqByCustomer.get(contact.customerId) ?? [] : [])]
    const inq = nearest(inqList, created, i => i.createdAt.getTime(), 45)
    const won = d.ft === 'Closed Won', lost = d.ft === 'Closed Lost'
    // The won deal's booking: the guest's first departure from the deal's creation on, within 18 months.
    // Bookings hang off the Customer made when the lead converted, so match on email as well as the contact's customer.
    const booking = won && contact
      ? [...(contact.customerId ? bookingsByCustomer.get(contact.customerId) ?? [] : []), ...(contact.em ? bookingsByEmail.get(contact.em) ?? [] : [])]
        .filter(b => b.startDate.getTime() >= created - 7 * DAY && b.startDate.getTime() <= created + 540 * DAY)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0]
      : undefined

    const stages = stagesByDeal.get(d.id) ?? []
    const replied = won || stages.some(e => REPLIED_STAGE.test(e.stage ?? ''))
    const proposalAt = stages.find(e => PROPOSAL_STAGE.test(e.stage ?? ''))?.at
    const firstMsg = stages.find(e => FIRST_MESSAGE_STAGE.test(e.stage ?? '') && e.at.getTime() >= created)
    const replyHours = firstMsg && firstMsg.at.getTime() - created <= 30 * DAY ? Math.round(((firstMsg.at.getTime() - created) / 36e5) * 10) / 10 : null

    const reason = lost ? lostReason(d.lost_reason) : null
    const quality = lower(d.quality)
    const qualified = won || replied || /average|strong/.test(quality) ? (reason === 'Junk lead' ? 0 : 1) : 0
    const status = won ? (booking?.status === 'cancelled' ? 'Cancelled' : 'Booked') : lost ? (!qualified ? 'Unqualified' : replied ? 'Lost' : 'No reply') : 'Open'

    const channel = channelFrom(inq?.utmSource || d.utm_source || '', inq?.utmMedium || d.utm_medium || '', d.medium || '', !!inq?.gclid, !!inq?.fbclid, inq?.source ?? null)
    const yacht = booking?.yacht || yachtFrom(d.product, d.feedback, inq?.website ?? null, inq?.form_trip || inq?.tripType || null)
    const formDest = normDestination(inq?.form_destination || (/komodo|raja|spice|sumbawa/i.test(inq?.form_trip ?? '') ? inq?.form_trip : null))
    const destination = booking?.dest ? normDestination(booking.dest) : formDest !== 'Unspecified' && formDest !== 'Other' ? formDest : yachtDestination(yacht)
    const voyage = booking ? (booking.tripType === 'OPEN_TRIP' ? 'Cabin charter' : 'Private charter') : voyageFrom(d.product, inq?.tripType ?? null)
    const checkIn = inq?.checkInDate && inq.checkInDate.getTime() > created ? inq.checkInDate : null
    const departure = booking?.startDate ?? checkIn
    const guests = booking?.guestCount ?? inq?.guestCount ?? (Number(d.guests) || null)
    const cabins = !(won && status === 'Booked') ? 0
      : voyage === 'Private charter' ? (booking?.cabins ?? cabinsByYacht.get(yacht) ?? 1)
      : Math.max(1, Math.ceil((guests ?? 2) / 2))
    const bookedAt = won ? (d.closed ?? booking?.createdAt ?? null) : null
    const country = normCountry(contact?.country) || normCountry(contact?.nationality) || 'Unknown'
    const eng = d.contact_id ? engByContact.get(d.contact_id) : undefined
    const repeat = !!(d.contact_id && (wonAt.get(d.contact_id) ?? []).some(t => t < created))
    const referral = /referral|word of mouth/i.test(`${inq?.utmMedium ?? ''} ${d.utm_medium ?? ''} ${d.medium ?? ''}`)
    const cta = inq?.source === 'META_LEAD_AD' ? 'Instant form' : inq?.source === 'CF7' ? 'Website form'
      : /whatsapp/i.test(d.reach ?? '') ? 'WhatsApp' : /mail/i.test(d.reach ?? '') ? 'Email' : /instagram/i.test(d.reach ?? '') ? 'Instagram DM'
      : inq ? 'Website form' : 'Unknown'

    rows.push({
      lead_id: d.id,
      enquiry_date: day(d.created),
      departure_date: day(departure),
      brand: yacht,
      destination,
      voyage_type: voyage,
      channel,
      campaign: inq?.utmCampaign || d.utm_campaign || null,
      campaign_type: channel === 'Meta Ads' || channel === 'Google Ads' ? 'Paid' : 'Organic',
      cta,
      country,
      nationality: EUROPE.has(country) ? 'European (flying in)' : 'Local',
      qualified,
      replied: replied ? 1 : 0,
      proposal: proposalAt || won ? 1 : 0,
      proposal_date: day(proposalAt ?? bookedAt),
      status,
      booking_date: day(bookedAt),
      lost_reason: reason,
      first_reply_hours: replyHours,
      cabins,
      booking_value_usd: won ? Math.round(booking?.totalPrice ?? d.amount ?? 0) : 0,
      contribution_margin_usd: null,
      trip_id: booking ? (booking.openTripId ?? booking.id) : null,
      web_sessions: eng?.page_views ?? 0,
      site_minutes: null,
      social_touches: 0,
      email_opens: eng?.email_opens ?? 0,
      whatsapp_msgs: 0,
      first_touch: FIRST_TOUCH[channel] ?? 'Unknown',
      top_page: null,
      guest_type: repeat ? 'Repeat' : referral ? 'Referral' : 'New',
      cancel_date: booking?.status === 'cancelled' ? day(booking.updatedAt) : null,
      refund_usd: 0,
      discount_usd: Math.round(booking?.discount ?? 0),
      commission_usd: 0,
    })
  }
  return rows.sort((a, b) => String(a.enquiry_date).localeCompare(String(b.enquiry_date)))
}

export async function buildTrips(): Promise<Row[]> {
  const [openTrips, bookings] = await withRetry(db, () => Promise.all([
    db.$queryRaw<OpenTripRow[]>`
      select o.id, y.name yacht, o."startDate", o."endDate", o."maxCapacity", coalesce(d.name, o.destination) dest
      from "OpenTrip" o join "Yacht" y on y.id = o."yachtId" left join "Destination" d on d.id = o."destinationId"
      where o.status::text <> 'cancelled'`,
    loadBookings(),
  ]))
  const nights = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY))
  const rows: Row[] = openTrips.map(o => ({
    trip_id: o.id, brand: o.yacht, destination: normDestination(o.dest), voyage_type: 'Cabin charter',
    departure_date: day(o.startDate), nights: nights(o.startDate, o.endDate), cabins: o.maxCapacity,
  }))
  for (const b of bookings) {
    if (b.openTripId || b.status === 'cancelled' || b.status === 'on_hold' || !b.yacht) continue
    rows.push({
      trip_id: b.id, brand: b.yacht, destination: normDestination(b.dest), voyage_type: 'Private charter',
      departure_date: day(b.startDate), nights: nights(b.startDate, b.endDate), cabins: b.cabins ?? 1,
    })
  }
  return rows.sort((a, b) => String(a.departure_date).localeCompare(String(b.departure_date)))
}

export const ERP_DATASETS: Record<string, () => Promise<Row[]>> = { leads: buildLeads, trips: buildTrips }
