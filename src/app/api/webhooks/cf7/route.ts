import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logActivity } from '@/lib/activity'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'

// This endpoint is meant to be called directly from the browser (client-side
// JS on the WordPress site listening for the wpcf7mailsent event), not just
// server-to-server — so it needs CORS. Auth is the ?secret= query param, not
// cookies, so a wide-open origin doesn't expose anything beyond the secret
// itself (which the client-side caller already has in plain view anyway).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

function pick(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
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
    // Each tenant's WordPress site should post to `?secret=...&tenant=<slug>`.
    // Falls back to 'samara' when omitted, so existing form configs keep working.
    // Resolved before the secret check below, since the secret itself is per-tenant.
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: 'CF7', tenantSlug: rawTenantSlug, reason: 'unknown_tenant', rawPayload: toJsonSafe(data) })
      return json({ error: 'Unknown or inactive tenant' }, 400)
    }
    const { db, tenant } = resolved

    // ── Verify secret token ──────────────────────────────────────────────────
    const secret   = request.nextUrl.searchParams.get('secret')
    const expected = await getTenantSecret(tenant.id, 'cf7WebhookSecret')
    if (!expected || secret !== expected) {
      logWebhookFailure({ source: 'CF7', tenantSlug: tenant.slug, reason: 'unauthorized', rawPayload: toJsonSafe(data) })
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Extract fields ────────────────────────────────────────────────────────
    // 'field_*' aliases are the Samara "Request Quote" CF7 form's actual tag names.
    const firstName = pick(data, 'field_FirstName', 'first-name', 'first_name', 'firstName', 'your-first-name')
    const lastName  = pick(data, 'field_LastName',  'last-name',  'last_name',  'lastName',  'your-last-name')
    const email     = pick(data, 'field_Email',     'email',       'your-email', 'Email')
    const phone     = pick(data, 'field_PhoneWA',   'phone',       'phone-wa',   'phone_wa',  'your-phone', 'Phone')
    const numGuests = pick(data, 'field_NumbGuests', 'number-of-guests', 'num-guests', 'number_of_guests', 'guests', 'guest-count')
    const checkIn   = pick(data, 'field_CheckIn',  'check-in-date',  'checkin',  'check_in',  'start-date', 'check-in')
    const checkOut  = pick(data, 'field_CheckOut', 'check-out-date', 'checkout', 'check_out', 'end-date',   'check-out')
    const tripType  = pick(data, 'field_TripType', 'trip-type',  'trip_type',  'tripType',  'trip')
    const message   = pick(data, 'field_Request',  'request',    'message',    'your-message', 'Request', 'Message')
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
    const rawUrl = pick(data, 'page-url', 'page_url', 'url', 'form-url')
    const url = isHttpUrl(rawUrl) ? rawUrl : ''
    const website = (() => { try { return url ? new URL(url).hostname : '' } catch { return '' } })()
    // Anonymous visitor-id cookie set by the same client-side tracker that reports
    // page views to /api/webhooks/pageview — used below to retroactively attach this
    // visitor's browsing history to whichever Lead/Customer this submission resolves to.
    const visitorId = pick(data, 'visitorId', 'visitor_id')

    if (!firstName && !email && !phone) {
      logWebhookFailure({ source: 'CF7', tenantSlug: tenant.slug, reason: 'insufficient_contact_data', rawPayload: toJsonSafe(data) })
      return json({ error: 'Insufficient contact data' }, 400)
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email || phone

    // ── Resolve owner: an existing Guest first, then an existing Lead, else a new Lead ──
    // Checking Guest first means someone who already converted and inquires again
    // attaches to their existing Customer instead of spawning a duplicate Lead.
    let ownerType: 'customer' | 'lead'
    let ownerId: string

    const existingCustomer = await (email
      ? db.customer.findFirst({ where: { email, deletedAt: null } })
      : Promise.resolve(null))
    const matchedCustomer = existingCustomer ?? (phone ? await db.customer.findFirst({ where: { phone, deletedAt: null } }) : null)

    if (matchedCustomer) {
      ownerType = 'customer'
      const updated = await db.customer.update({
        where: { id: matchedCustomer.id },
        data: {
          name: fullName,
          ...(firstName && { firstName }),
          ...(lastName  && { lastName  }),
          ...(email     && { email     }),
          ...(phone     && { phone     }),
        },
        select: { id: true },
      })
      ownerId = updated.id
    } else {
      const existingLead = await (email
        ? db.lead.findFirst({ where: { email, deletedAt: null } })
        : Promise.resolve(null))
      const matchedLead = existingLead ?? (phone ? await db.lead.findFirst({ where: { phone, deletedAt: null } }) : null)

      if (matchedLead) {
        ownerType = 'lead'
        const updated = await db.lead.update({
          where: { id: matchedLead.id },
          data: {
            name: fullName,
            ...(firstName && { firstName }),
            ...(lastName  && { lastName  }),
            ...(email     && { email     }),
            ...(phone     && { phone     }),
          },
          select: { id: true },
        })
        ownerId = updated.id
      } else {
        ownerType = 'lead'
        const created = await db.lead.create({
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

    await db.inquiry.create({
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
        rawPayload:   toJsonSafe(data),
      },
    })

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
