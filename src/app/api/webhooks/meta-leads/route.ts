import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logActivity } from '@/lib/activity'
import { autoAssignWebsiteLead } from '@/lib/whatsapp-lead'
import { logWebhookFailure } from '@/lib/webhook-log'
import { WHATSAPP_GRAPH_VERSION } from '@/lib/whatsapp-brands'

// Meta (Facebook/Instagram) Lead Ads instant-form leads → Lead + Inquiry, same
// owner resolution as the website CF7 webhook (existing Customer → existing Lead → new Lead).
// Accepts two kinds of delivery on the same URL:
//
// 1. Native Meta leadgen webhook — Meta only sends a leadgen_id, the actual answers
//    are fetched back from the Graph API with the Page token.
//      Meta App → Webhooks → Page → subscribe to `leadgen`
//      Callback URL:  https://<app-domain>/api/webhooks/meta-leads?tenant=<slug>
//      Verify token:  "Meta Lead Ads Webhook Secret" in Super Admin
//    The page must also have the app installed (POST /{page-id}/subscribed_apps
//    with subscribed_fields=leadgen).
//
// 2. Flat payload (Zapier / Make / manual re-post of a Meta CSV export row) —
//    POST https://<app-domain>/api/webhooks/meta-leads?tenant=<slug>&secret=<secret>
//    JSON keyed by the same column names as the Meta lead CSV export:
//    id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
//    form_id, form_name, is_organic, platform, full_name, email, phone_number, plus
//    each custom question as its own key (or a Graph-style `field_data` array).

const SOURCE = 'META_LEAD_AD'

const GRAPH_LEAD_FIELDS = [
  'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'campaign_id', 'campaign_name', 'form_id', 'is_organic', 'platform', 'field_data',
].join(',')

// Keys of the CSV export / Graph lead object that describe the ad, not the person's answers.
const META_KEYS = new Set([
  'id', 'leadgen_id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
  'lead_status', 'page_id', 'field_data', 'secret', 'tenant',
])
const CONTACT_KEYS = new Set(['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'])

interface MetaLead {
  leadgenId: string
  createdTime: Date
  adId: string
  adName: string
  adsetName: string
  campaignName: string
  formId: string
  formName: string
  isOrganic: boolean
  platform: string
  fields: Record<string, string>
  raw: Record<string, string>
}

type IngestResult =
  | { ok: true; ownerType: 'customer' | 'lead'; ownerId: string; duplicate: boolean }
  | { ok: false; reason: 'insufficient_contact_data' }

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

// Flattens to string-only values for logging/audit (field_data → "<name>: a, b").
function toJsonSafe(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'secret') continue
    if (k === 'field_data' && Array.isArray(v)) {
      for (const f of v as { name?: string; values?: unknown[] }[]) {
        if (f?.name) out[f.name] = (f.values ?? []).map(str).filter(Boolean).join(', ')
      }
    } else if (str(v)) {
      out[k] = str(v)
    }
  }
  return out
}

function parseCreatedTime(raw: string): Date {
  // Graph gives "2026-09-26T04:07:03+0000"; the CSV export gives "09/26/2026 04:07:03".
  const d = new Date(raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return isNaN(d.getTime()) ? new Date() : d
}

function toMetaLead(data: Record<string, unknown>): MetaLead {
  const raw = toJsonSafe(data)
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!META_KEYS.has(k)) fields[k] = v
  }
  const platform = str(data.platform).toLowerCase()
  return {
    leadgenId:    str(data.leadgen_id) || str(data.id),
    createdTime:  parseCreatedTime(str(data.created_time)),
    adId:         str(data.ad_id),
    adName:       str(data.ad_name),
    adsetName:    str(data.adset_name),
    campaignName: str(data.campaign_name),
    formId:       str(data.form_id),
    formName:     str(data.form_name),
    isOrganic:    str(data.is_organic).toLowerCase() === 'true',
    platform:     platform === 'ig' ? 'instagram' : platform === 'fb' ? 'facebook' : platform,
    fields,
    raw,
  }
}

// Meta answer values come snake-cased: "5–8_nov_·_4d3n" → "5–8 Nov · 4D3N".
function prettyAnswer(v: string): string {
  return v
    .replace(/_/g, ' ')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, m => m[0].toUpperCase() + m.slice(1).toLowerCase())
    .replace(/\b(\d+)d(\d+)n\b/gi, '$1D$2N')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Which_departure_are_you_interested_in?" → "Which departure are you interested in?"
function prettyQuestion(k: string): string {
  const s = k.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// "5–8 Nov", "28 Nov – 1 Dec" → check-in/out dates. The year isn't in the answer, so it's
// the lead's own year, rolled forward when that would put the trip well in the past
// (a December lead asking about a January departure).
function parseDepartureRange(label: string, ref: Date): { checkIn: Date; checkOut: Date } | null {
  const m = label.toLowerCase().match(/(\d{1,2})\s*([a-z]{3,9})?\s*[–—-]\s*(\d{1,2})\s*([a-z]{3,9})/)
  if (!m) return null
  const endMonth = MONTHS.indexOf(m[4].slice(0, 3))
  const startMonth = m[2] ? MONTHS.indexOf(m[2].slice(0, 3)) : endMonth
  if (endMonth < 0 || startMonth < 0) return null
  let year = ref.getUTCFullYear()
  if (Date.UTC(year, startMonth, +m[1]) < ref.getTime() - 31 * 86_400_000) year++
  const endYear = endMonth < startMonth ? year + 1 : year
  const checkIn = new Date(Date.UTC(year, startMonth, +m[1]))
  const checkOut = new Date(Date.UTC(endYear, endMonth, +m[3]))
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return null
  return { checkIn, checkOut }
}

async function ingestLead(db: PrismaClient, lead: MetaLead): Promise<IngestResult> {
  const f = lead.fields
  const email = f.email ?? ''
  const phone = f.phone_number ?? f.phone ?? ''
  let firstName = f.first_name ?? ''
  let lastName = f.last_name ?? ''
  const fullNameField = f.full_name ?? ''
  if (!firstName && fullNameField) {
    const parts = fullNameField.split(/\s+/)
    firstName = parts[0]
    lastName = parts.slice(1).join(' ')
  }
  if (!firstName && !email && !phone) return { ok: false, reason: 'insufficient_contact_data' }
  const fullName = fullNameField || [firstName, lastName].filter(Boolean).join(' ') || email || phone

  // Custom questions: departure → dates, guest count → guestCount, the rest only in the message.
  const questions = Object.entries(f).filter(([k]) => !CONTACT_KEYS.has(k))
  const departureEntry = questions.find(([k]) => /departure|date|trip|when/i.test(k))
  const guestsEntry = questions.find(([k]) => /guest|pax|people|person|travell?ing/i.test(k))
  const departure = departureEntry ? prettyAnswer(departureEntry[1]) : ''
  const range = departure ? parseDepartureRange(departure, lead.createdTime) : null
  const guestCount = guestsEntry ? parseInt(guestsEntry[1], 10) : NaN

  const message = [
    ...questions.map(([k, v]) => `${prettyQuestion(k)}: ${prettyAnswer(v)}`),
    lead.formName && `Form: ${lead.formName}`,
    lead.adName && `Ad: ${lead.adName}`,
  ].filter(Boolean).join('\n')

  const website = lead.platform ? `${lead.platform}.com` : null
  // Form name doubles as tripType so brandForInquiry routes "Otium …"/"Mischief …" forms
  // to that brand's sales pool, same as a website inquiry would.
  const tripType = lead.formName || lead.campaignName || null
  const utmSource = lead.platform || 'meta'
  const utmMedium = lead.isOrganic ? 'organic_social' : 'paid_social'

  // Meta stores numbers as "+62…", WhatsApp-created Leads/Customers as "62…" — match either.
  const phoneVariants = phone ? [...new Set([phone, phone.replace(/^\+/, ''), `+${phone.replace(/^\+/, '')}`])] : []

  // Same per-contact advisory lock keys as the CF7 webhook, so the same person arriving
  // from both at once still resolves to a single Lead.
  const lockKeys = [email && `cf7:email:${email.toLowerCase()}`, phone && `cf7:phone:${phone}`]
    .filter((k): k is string => !!k)
    .sort()

  const result = await db.$transaction(async (tx) => {
    for (const key of lockKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
    }

    // Meta retries deliveries it didn't get a 200 for — the leadgen id makes that idempotent.
    if (lead.leadgenId) {
      const seen = await tx.inquiry.findFirst({
        where: { source: SOURCE, reference: lead.leadgenId },
        select: { leadId: true, customerId: true },
      })
      if (seen && (seen.customerId || seen.leadId)) {
        return seen.customerId
          ? { ownerType: 'customer' as const, ownerId: seen.customerId, duplicate: true }
          : { ownerType: 'lead' as const, ownerId: seen.leadId!, duplicate: true }
      }
    }

    let ownerType: 'customer' | 'lead'
    let ownerId: string

    const matchedCustomer =
      (email ? await tx.customer.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } }) : null) ??
      (phone ? await tx.customer.findFirst({ where: { phone: { in: phoneVariants }, deletedAt: null } }) : null)

    if (matchedCustomer) {
      ownerType = 'customer'
      // Only fill gaps — a Customer's details are usually passport-verified.
      const updated = await tx.customer.update({
        where: { id: matchedCustomer.id },
        data: {
          ...(!matchedCustomer.email && email && { email }),
          ...(!matchedCustomer.phone && phone && { phone }),
        },
        select: { id: true },
      })
      ownerId = updated.id
    } else {
      const leadSelect = { id: true, firstName: true, lastName: true, email: true, phone: true } as const
      const matchedLead =
        (email ? await tx.lead.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null }, select: leadSelect }) : null) ??
        (phone ? await tx.lead.findFirst({ where: { phone: { in: phoneVariants }, deletedAt: null }, select: leadSelect }) : null)

      if (matchedLead) {
        ownerType = 'lead'
        const updated = await tx.lead.update({
          where: { id: matchedLead.id },
          data: {
            ...(!matchedLead.firstName && firstName && { firstName, lastName: lastName || null, name: fullName }),
            ...(!matchedLead.email && email && { email }),
            ...(!matchedLead.phone && phone && { phone }),
          },
          select: { id: true },
        })
        ownerId = updated.id
      } else {
        ownerType = 'lead'
        const created = await tx.lead.create({
          data: {
            name:      fullName,
            firstName: firstName || null,
            lastName:  lastName  || null,
            email:     email     || null,
            phone:     phone     || null,
          },
          select: { id: true },
        })
        ownerId = created.id
      }
    }

    await tx.inquiry.create({
      data: {
        source: SOURCE,
        ...(ownerType === 'customer' ? { customerId: ownerId } : { leadId: ownerId }),
        checkInDate:  range?.checkIn ?? null,
        checkOutDate: range?.checkOut ?? null,
        guestCount:   isFinite(guestCount) ? guestCount : null,
        tripType,
        message:      message || null,
        website,
        leadSource:   'Meta Lead Ad',
        reference:    lead.leadgenId || null,
        // Campaign → utm_campaign, ad set → utm_term, ad → utm_content, mirroring how
        // Meta's own URL parameters ({{campaign.name}} etc.) are usually mapped.
        utmSource,
        utmMedium,
        utmCampaign:  lead.campaignName || null,
        utmTerm:      lead.adsetName    || null,
        utmContent:   lead.adName       || null,
        lastSource:   utmSource,
        lastMedium:   utmMedium,
        lastCampaign: lead.campaignName || null,
        lastTerm:     lead.adsetName    || null,
        lastContent:  lead.adName       || null,
        rawPayload:   lead.raw,
        createdAt:    lead.createdTime,
      },
    })

    return { ownerType, ownerId, duplicate: false }
  })

  if (!result.duplicate) {
    if (result.ownerType === 'lead') {
      await autoAssignWebsiteLead(db, result.ownerId, website, fullName, tripType).catch(e => console.error('[Meta leads webhook] auto-assign failed', e))
    }
    logActivity({
      userId: '', userName: 'Meta Lead Ads', userRole: 'SYSTEM',
      action: 'CREATE', entity: result.ownerType === 'customer' ? 'Customer' : 'Lead', entityId: result.ownerId,
      detail: `Meta lead form: ${fullName}${lead.formName ? ` · ${lead.formName}` : ''}${departure ? ` · ${departure}` : ''}`,
    }, db).catch(() => {})
  }

  return { ok: true, ...result }
}

// ── Native Meta leadgen webhook ─────────────────────────────────────────────────

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const provided = header.slice('sha256='.length)
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    console.error('[Meta leads webhook] Graph API', path, res.status, await res.text().catch(() => ''))
    return null
  }
  return res.json()
}

// Subscription handshake — Meta calls this once when the callback URL is saved.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const resolved = await resolveTenantBySlugFull(params.get('tenant'))
  if (!resolved) return new NextResponse('Unknown tenant', { status: 400 })

  const expected = await getTenantSecret(resolved.tenant.id, 'metaLeadsWebhookSecret')
  if (params.get('hub.mode') === 'subscribe' && expected && params.get('hub.verify_token') === expected) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')
  const rawBody = await request.text()

  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(rawBody)
  } catch {
    for (const [k, v] of new URLSearchParams(rawBody).entries()) data[k] = v
  }

  try {
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: SOURCE, tenantSlug: rawTenantSlug, reason: 'unknown_tenant', rawPayload: toJsonSafe(data) })
      return NextResponse.json({ error: 'Unknown or inactive tenant' }, { status: 400 })
    }
    const { db, tenant } = resolved

    if (data.object === 'page' && Array.isArray(data.entry)) {
      // Native delivery: authenticated by Meta's signature, not ?secret=.
      const appSecret = await getTenantSecret(tenant.id, 'metaLeadsAppSecret')
      if (!appSecret || !verifySignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
        logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'unauthorized', rawPayload: { body: rawBody.slice(0, 5000) } })
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const token = await getTenantSecret(tenant.id, 'metaLeadsPageToken')
      if (!token) {
        logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'exception', detail: 'Meta Lead Ads Page Access Token not set', rawPayload: { body: rawBody.slice(0, 5000) } })
        return NextResponse.json({ ok: true })
      }

      const changes = (data.entry as { changes?: { field?: string; value?: Record<string, unknown> }[] }[])
        .flatMap(e => e.changes ?? [])
        .filter(c => c.field === 'leadgen' && c.value?.leadgen_id)

      const formNames = new Map<string, string>()
      for (const change of changes) {
        const value = change.value!
        const leadgenId = str(value.leadgen_id)
        try {
          const graphLead = await graphGet(`${leadgenId}?fields=${GRAPH_LEAD_FIELDS}`, token)
          if (!graphLead) {
            logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'exception', detail: `Graph API fetch failed for lead ${leadgenId}`, rawPayload: toJsonSafe(value) })
            continue
          }
          const formId = str(graphLead.form_id) || str(value.form_id)
          if (formId && !formNames.has(formId)) {
            const form = await graphGet(`${formId}?fields=name`, token)
            formNames.set(formId, str(form?.name))
          }
          const lead = toMetaLead({ ...graphLead, form_name: formNames.get(formId) ?? '' })
          const result = await ingestLead(db, lead)
          if (!result.ok) logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: result.reason, rawPayload: lead.raw })
        } catch (error) {
          logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'exception', detail: String(error), rawPayload: toJsonSafe(value) })
          console.error('[Meta leads webhook]', leadgenId, error)
        }
      }
      // Always 200 once authenticated — failures are logged above; a non-200 only makes
      // Meta retry the whole batch (and eventually disable the subscription).
      return NextResponse.json({ ok: true })
    }

    // Flat delivery (Zapier/Make/CSV row): authenticated by ?secret=.
    const secret = request.nextUrl.searchParams.get('secret') ?? str(data.secret)
    const expected = await getTenantSecret(tenant.id, 'metaLeadsWebhookSecret')
    if (!expected || secret !== expected) {
      logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: 'unauthorized', rawPayload: toJsonSafe(data) })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // A batch (array of rows, e.g. a whole CSV export) or a single row.
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : Array.isArray(data.leads) ? data.leads as Record<string, unknown>[] : [data]
    const results: (IngestResult & { id: string | null })[] = []
    for (const row of rows) {
      const lead = toMetaLead(row)
      const result = await ingestLead(db, lead)
      if (!result.ok) logWebhookFailure({ source: SOURCE, tenantSlug: tenant.slug, reason: result.reason, rawPayload: lead.raw })
      results.push({ id: lead.leadgenId || null, ...result })
    }
    return NextResponse.json(rows.length === 1 ? results[0] : { ok: true, results }, { status: rows.length === 1 && !results[0].ok ? 400 : 200 })
  } catch (error) {
    logWebhookFailure({ source: SOURCE, tenantSlug: rawTenantSlug, reason: 'exception', detail: String(error), rawPayload: toJsonSafe(data) })
    console.error('[Meta leads webhook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
