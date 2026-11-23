import type { PrismaClient, WhatsappBrand } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logActivity } from '@/lib/activity'
import { brandForInquiry } from '@/lib/whatsapp-lead'
import { matchDestinationId, parseBudget } from '@/lib/form-trip-details'
import { contactLockKeys, enquirySummary, flushDealPushes, lockContact, runDealMaker, tripTypeFromText, type PushNotice } from '@/lib/deal-maker'
import { isDealMakerOn } from '@/lib/deal-maker-switch'
import { inferDealYacht } from '@/lib/deal-product-interest'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'
import { getClientIp, countryFromIp } from '@/lib/geo-country'
import { providedWebhookSecret, webhookSecretMatches } from '@/lib/webhook-secret'
import { cleanValue, trackingFromPayload } from '@/lib/inquiry-tracking'
import { fillEmptyOnly, findContactByIdentity, isPlaceholderName, normalizeEmail, toE164 } from '@/lib/contact-identity'

// Called server-to-server only, by the WordPress site (a PHP hook on
// wpcf7_mail_sent) with the secret in the X-Webhook-Secret header, so the
// secret never reaches the browser. No CORS and no ?secret= — a browser can't
// call this, and the secret never lands in a URL or access log.
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

// First non-blank of the given keys. The site's JS sends the literal "undefined" for hidden
// inputs it never filled — treated as blank (see cleanValue).
function pick(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = cleanValue(data[key], 5000)
    if (val) return val
  }
  return ''
}

function parseDate(raw: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function parseInt10(raw: string): number | null {
  const n = parseInt(raw, 10)
  return isFinite(n) ? n : null
}

// Strips non-JSON-serializable values (e.g. a File from a multipart upload field)
// before storing the raw submission as an audit trail.
function toJsonSafe(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export async function POST(request: NextRequest) {
  // Raw ?tenant= as given, before it's known to resolve to anything — kept
  // around so a failure log can still be written even when the tenant lookup
  // below fails.
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')

  // ── Parse body (JSON or form-encoded) ──────────────────────────────────────
  // Done up front, before any validation, so every rejection path below —
  // including "unknown tenant" and "bad secret" — can still log what was
  // actually submitted. A parse failure here just leaves `data` empty rather
  // than aborting the request; the "insufficient contact data" check further
  // down will catch that case and still log it.
  const contentType = request.headers.get('content-type') ?? ''
  let data: Record<string, unknown> = {}
  try {
    if (contentType.includes('application/json')) {
      data = await request.json()
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData()
      for (const [k, v] of form.entries()) data[k] = v
    } else {
      const text = await request.text()
      try {
        data = JSON.parse(text)
      } catch {
        for (const [k, v] of new URLSearchParams(text).entries()) data[k] = v
      }
    }
  } catch { /* leave data empty — still worth logging on rejection below */ }

  try {
    // ── Resolve which tenant this lead belongs to ────────────────────────────
    // Each tenant's WordPress site should post to `?tenant=<slug>`.
    // Falls back to 'samara' when omitted, so existing form configs keep working.
    // Resolved before the secret check below, since the secret itself is per-tenant.
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: 'CF7', tenantSlug: rawTenantSlug, reason: 'unknown_tenant', rawPayload: toJsonSafe(data) })
      return json({ error: 'Unknown or inactive tenant' }, 400)
    }
    const { db, tenant } = resolved

    // ── Verify secret token ──────────────────────────────────────────────────
    const expected = await getTenantSecret(tenant.id, 'cf7WebhookSecret')
    if (!webhookSecretMatches(providedWebhookSecret(request), expected)) {
      logWebhookFailure({ source: 'CF7', tenantSlug: tenant.slug, reason: 'unauthorized', rawPayload: toJsonSafe(data) })
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Forms that are never a lead (handover §2: newsletter 90693) ──────────
    // The plugin sends the CF7 form ID (docs/wordpress-cf7-webhook.php). Form IDs are per site, so
    // entries are "host:id" (a bare id matches every site). The list lives in SystemSetting
    // "cf7_ignored_form_ids" (comma-separated) so a new newsletter form needs no deploy.
    const formId = pick(data, 'form_id', '_wpcf7')
    if (formId) {
      const formHost = (() => { try { return new URL(pick(data, 'page-url', 'page_url', 'form_page_url', 'url')).hostname.replace(/^www\./, '') } catch { return '' } })()
      const ignored = await ignoredCf7FormIds(db)
      if (ignored.has(formId) || (formHost && ignored.has(`${formHost}:${formId}`))) {
        return json({ ok: true, skipped: 'ignored_form', formId })
      }
    }

    // ── Extract fields ────────────────────────────────────────────────────────
    // 'field_*' aliases are the Samara "Request Quote" CF7 form's actual tag names.
    const firstName = pick(data, 'field_FirstName', 'first-name', 'first_name', 'firstName', 'your-first-name')
    const lastName  = pick(data, 'field_LastName',  'last-name',  'last_name',  'lastName',  'your-last-name')
    // Identity: email normalised (trim + lowercase); phone kept in E.164 when it carries a
    // country code (+ / 00 — never guessed), else as typed. Matching uses the E.164 only.
    const email     = normalizeEmail(pick(data, 'field_Email', 'email', 'your-email', 'Email')) ?? ''
    const rawPhone  = pick(data, 'field_PhoneWA',   'phone',       'phone-wa',   'phone_wa',  'your-phone', 'Phone')
    const phoneE164 = toE164(rawPhone)
    const phone     = phoneE164 ?? rawPhone
    const numGuests = pick(data, 'field_NumbGuests', 'number-of-guests', 'num-guests', 'number_of_guests', 'guests', 'guest-count')
    const checkIn   = pick(data, 'field_CheckIn',  'check-in-date',  'checkin',  'check_in',  'start-date', 'check-in')
    const checkOut  = pick(data, 'field_CheckOut', 'check-out-date', 'checkout', 'check_out', 'end-date',   'check-out')
    const tripType  = pick(data, 'field_TripType', 'trip-type',  'trip_type',  'tripType',  'trip')
    const message   = pick(data, 'field_Request',  'request',    'message',    'your-message', 'Request', 'Message')
    // Charter-form extras (handover §2 "Trip details"): src/lib/form-trip-details.ts
    const destinationText = pick(data, 'field_Destination', 'destination')
    const durationText    = pick(data, 'field_Duration', 'duration')
    const budget          = parseBudget(pick(data, 'field_Budget', 'budget'))
    // First-touch attribution ("Original" touch in Freshsales terms) — the form's ft_*
    // fields, persisted client-side (e.g. cookie) from the visitor's very first session,
    // as opposed to this specific submission's own traffic source below.
    const ftUtmSource   = pick(data, 'ft_utm_source',   'ft-utm-source')
    const ftUtmMedium   = pick(data, 'ft_utm_medium',   'ft-utm-medium')
    const ftUtmCampaign = pick(data, 'ft_utm_campaign', 'ft-utm-campaign')
    const ftUtmTerm     = pick(data, 'ft_utm_term',     'ft-utm-term')
    const ftUtmContent  = pick(data, 'ft_utm_content',  'ft-utm-content')
    const ftGclid       = pick(data, 'ft_gclid')
    const ftGbraid      = pick(data, 'ft_gbraid')
    const ftWbraid      = pick(data, 'ft_wbraid')
    const ftFbclid      = pick(data, 'ft_fbclid')
    // This submission's own touch ("Created from" touch in Freshsales terms) — the
    // form's bare utm_*/click-id fields, i.e. whatever traffic source led to this
    // specific inquiry (which may differ from the visitor's first-ever touch above).
    const utmSource   = pick(data, 'utm_source',   'utm-source')
    const utmMedium   = pick(data, 'utm_medium',   'utm-medium')
    const utmCampaign = pick(data, 'utm_campaign', 'utm-campaign')
    const utmTerm     = pick(data, 'utm_term',     'utm-term')
    const utmContent  = pick(data, 'utm_content',  'utm-content')
    // Click IDs — needed to later match a booking back to the ad click that produced it
    // (offline conversion import). gclid = Google Ads, gbraid/wbraid = Google Ads'
    // app/privacy-sandbox web variants, fbclid = Meta/Facebook.
    const gclid  = pick(data, 'gclid')
    const gbraid = pick(data, 'gbraid')
    const wbraid = pick(data, 'wbraid')
    const fbclid = pick(data, 'fbclid')
    // Consent, Microsoft click ID, Meta cookies, landing pages, referrer, IP, UA, session
    // attributes — all stored for every lead (src/lib/inquiry-tracking.ts); consent only
    // decides what may later be sent to Google/Meta.
    // No request-IP/UA fallback: the caller is the WordPress server, so those would be the
    // site's own — the plugin forwards the visitor's as visitor_ip / user_agent.
    const tracking = trackingFromPayload(data)
    const rawUrl = pick(data, 'page-url', 'page_url', 'form_page_url', 'url', 'form-url')
    const url = isHttpUrl(rawUrl) ? rawUrl : ''
    const website = (() => { try { return url ? new URL(url).hostname : '' } catch { return '' } })()
    // Anonymous visitor-id cookie set by the same client-side tracker that reports
    // page views to /api/webhooks/pageview — used below to retroactively attach this
    // visitor's browsing history to whichever Lead/Customer this submission resolves to.
    const visitorId = pick(data, 'visitorId', 'visitor_id')
    // Best-effort country guess from the submitter's IP — only ever used to fill
    // in a Lead that doesn't have a nationality yet, never to overwrite one a
    // human entered (or, for a matched Customer, their passport-verified data).
    // A server-side caller (the WordPress PHP hook) forwards the visitor's IP
    // as visitor_ip — otherwise the request IP would be the WordPress server's.
    // Safe to trust here since the secret has already been verified above.
    const ipCountry = countryFromIp(pick(data, 'visitor_ip') || getClientIp(request))

    if (!firstName && !email && !phone) {
      logWebhookFailure({ source: 'CF7', tenantSlug: tenant.slug, reason: 'insufficient_contact_data', rawPayload: toJsonSafe(data) })
      return json({ error: 'Insufficient contact data' }, 400)
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email || phone

    // ── Resolve owner: an existing Guest first, then an existing Lead, else a new Lead ──
    // Checking Guest first means someone who already converted and inquires again
    // attaches to their existing Customer instead of spawning a duplicate Lead.
    //
    // Resolution + inquiry insert run under a per-contact advisory lock: the same
    // submission can arrive twice within milliseconds (double-click, or the site firing
    // the webhook twice), and without the lock both requests miss each other's "find
    // existing" check and each create a Lead.
    // Same keys in every intake path (form, Meta, chats — src/lib/deal-maker.ts), sorted so two
    // requests locking the same pair can't deadlock. Held through the deal maker below too, so one
    // person's double submit / form + WhatsApp can't open two deals (parity B3).
    const lockKeys = contactLockKeys(email, phoneE164)
    // Hidden "brand" field on the form (parity E10: Otium / Mischief sites, Samara's form 53463 and the
    // /yacht/otium/ form) wins; else the trip type / site decides.
    const brandField = (pick(data, 'brand', 'erp_brand', 'site_brand') || '').trim().toLowerCase()
    const brand: WhatsappBrand = /otium/.test(brandField) ? 'OTIUM' : /mischief/.test(brandField) ? 'MISCHIEF' : /samara/.test(brandField) ? 'SAMARA' : brandForInquiry(website, tripType)

    const { ownerType, ownerId, duplicate, pushes } = await db.$transaction(async (tx) => {
      await lockContact(tx, lockKeys)

      let ownerType: 'customer' | 'lead'
      let ownerId: string

      // Guest first, then Lead — normalised email, else exact E.164 (src/lib/contact-identity.ts).
      // "Never overwrite": the form only fills fields that are still empty; the name is only
      // replaced when the current one is a stand-in (an email / number / chat handle).
      const match = await findContactByIdentity(tx, { email, phoneE164 })
      // Destination + budget onto the Lead, only where still empty (never overwrite).
      const destinationId = await matchDestinationId(tx, destinationText)
      const tripExtras = { destinationId, ...(budget ?? {}) }
      const incoming = { firstName: firstName || null, lastName: lastName || null, email: email || null, phone: phone || null }

      if (match?.type === 'customer') {
        ownerType = 'customer'
        const cur = await tx.customer.findUniqueOrThrow({ where: { id: match.id }, select: { name: true, firstName: true, lastName: true, email: true, phone: true } })
        const fill = fillEmptyOnly(cur, incoming)
        if (Object.keys(fill).length) await tx.customer.update({ where: { id: match.id }, data: fill })
        ownerId = match.id
      } else if (match?.type === 'lead') {
        ownerType = 'lead'
        const cur = await tx.lead.findUniqueOrThrow({ where: { id: match.id }, select: { name: true, firstName: true, lastName: true, email: true, phone: true, nationality: true, destinationId: true, budgetMin: true, budgetMax: true, budgetCurrency: true } })
        // Budget fields move together: only when the lead has no budget at all.
        const budgetFill = cur.budgetMin == null && cur.budgetMax == null ? budget ?? {} : {}
        const fill = { ...fillEmptyOnly(cur, { ...incoming, nationality: ipCountry || null, destinationId }), ...budgetFill }
        const realName = [firstName, lastName].filter(Boolean).join(' ')
        const rename = realName && isPlaceholderName(cur.name, cur)
          ? { name: realName, firstName: firstName || null, lastName: lastName || null }
          : {}
        if (Object.keys(fill).length || Object.keys(rename).length) {
          await tx.lead.update({ where: { id: match.id }, data: { ...fill, ...rename } })
        }
        ownerId = match.id
      } else {
        ownerType = 'lead'
        const created = await tx.lead.create({
          data: {
            name:        fullName,
            firstName:   firstName || null,
            lastName:    lastName  || null,
            email:       email     || null,
            phone:       phone     || null,
            nationality: ipCountry || null,
            ...tripExtras,
          },
          select: { id: true },
        })
        ownerId = created.id
      }

      // Same submission already recorded moments ago → don't store a second copy.
      const duplicate = await tx.inquiry.findFirst({
        where: {
          source: 'CF7',
          ...(ownerType === 'customer' ? { customerId: ownerId } : { leadId: ownerId }),
          message: message || null,
          url: url || null,
          createdAt: { gte: new Date(Date.now() - 2 * 60_000) },
        },
        select: { id: true },
      })
      if (duplicate) return { ownerType, ownerId, duplicate: true, pushes: [] }

      const inquiry = await tx.inquiry.create({
        select: { id: true },
        data: {
          source: 'CF7',
          ...(ownerType === 'customer' ? { customerId: ownerId } : { leadId: ownerId }),
          checkInDate:  parseDate(checkIn),
          checkOutDate: parseDate(checkOut),
          guestCount:   numGuests ? parseInt10(numGuests) : null,
          tripType:     tripType || null,
          message:      message  || null,
          website:      website || null,
          url:          url     || null,
          // First touch — prefers the form's ft_* capture; falls back to the bare field so
          // this keeps working even before ft_* fields exist on a given form.
          utmSource:    ftUtmSource   || utmSource   || null,
          utmMedium:    ftUtmMedium   || utmMedium   || null,
          utmCampaign:  ftUtmCampaign || utmCampaign || null,
          utmTerm:      ftUtmTerm     || utmTerm     || null,
          utmContent:   ftUtmContent  || utmContent  || null,
          gclid:        ftGclid       || gclid       || null,
          gbraid:       ftGbraid      || gbraid      || null,
          wbraid:       ftWbraid      || wbraid      || null,
          fbclid:       ftFbclid      || fbclid      || null,
          // This submission's own touch — always the bare (non-ft_) fields.
          lastSource:   utmSource   || null,
          lastMedium:   utmMedium   || null,
          lastCampaign: utmCampaign || null,
          lastTerm:     utmTerm     || null,
          lastContent:  utmContent  || null,
          lastGclid:    gclid       || null,
          lastGbraid:   gbraid      || null,
          lastWbraid:   wbraid      || null,
          lastFbclid:   fbclid      || null,
          ...tracking,
          rawPayload:   toJsonSafe(data),
        },
      })

      // Deal rules (parity B): open deal of this brand + trip type → note + 4h task for its owner;
      // else a new deal in New Enquiry owned by the contact owner / round-robin. Website brand
      // (B1): Otium / Mischief trip types and sites go to their own pipeline.
      const checkInDate = parseDate(checkIn), checkOutDate = parseDate(checkOut)
      const guests = numGuests ? parseInt10(numGuests) : null
      // Switched off by an admin (src/lib/deal-maker-switch.ts) → lead + enquiry only, no automatic deal.
      const dm = !(await isDealMakerOn(tx, 'WEBSITE_FORM')) ? { pushes: [] as PushNotice[] } : await runDealMaker(tx, {
        ...(ownerType === 'customer' ? { customerId: ownerId } : { leadId: ownerId }),
        brand,
        tripType: tripTypeFromText(tripType),
        channel: 'WEBSITE_FORM',
        enquiry: true,
        inquiryId: inquiry.id,
        summary: enquirySummary({ tripType, guestCount: guests, checkIn: checkInDate, checkOut: checkOutDate, destination: destinationText, duration: durationText, budget, message }),
        travelStartDate: checkInDate, travelEndDate: checkOutDate, guestCount: guests,
        productInterest: inferDealYacht({ text: tripType, url: url || null, brand, tripType: tripTypeFromText(tripType) }),
      })

      return { ownerType, ownerId, duplicate: false, pushes: dm.pushes }
    }, { timeout: 20000 })

    if (duplicate) return json({ ok: true, ownerType, ownerId, duplicate: true })
    await flushDealPushes(db, pushes)

    logActivity({
      userId: '', userName: 'Website CF7', userRole: 'SYSTEM',
      action: 'CREATE', entity: ownerType === 'customer' ? 'Customer' : 'Lead', entityId: ownerId,
      detail: `Website inquiry: ${fullName}${message ? ` · ${message}` : ''}`,
    }, db).catch(() => {})

    // Attach this visitor's page-view history (recorded anonymously up to now via
    // /api/webhooks/pageview) to the Lead/Customer this submission just resolved to.
    // Only claims rows still unowned — an existing owner (from a prior submission)
    // is left alone.
    if (visitorId) {
      db.pageView.updateMany({
        where: { visitorId, leadId: null, customerId: null },
        data: ownerType === 'customer' ? { customerId: ownerId } : { leadId: ownerId },
      }).catch(() => {})
    }

    return json({ ok: true, ownerType, ownerId })
  } catch (error) {
    logWebhookFailure({ source: 'CF7', tenantSlug: rawTenantSlug, reason: 'exception', detail: String(error), rawPayload: toJsonSafe(data) })
    console.error('[CF7 webhook]', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

const DEFAULT_IGNORED_CF7_FORMS = 'samaraliveaboard.com:90693'
async function ignoredCf7FormIds(db: PrismaClient): Promise<Set<string>> {
  const row = await db.systemSetting.findUnique({ where: { key: 'cf7_ignored_form_ids' } }).catch(() => null)
  return new Set((row?.textValue ?? DEFAULT_IGNORED_CF7_FORMS).toLowerCase().split(/[\s,]+/).filter(Boolean).map(e => e.replace(/^www\./, '')))
}
