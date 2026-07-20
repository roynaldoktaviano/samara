import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { logActivity } from '@/lib/activity'

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
  try {
    // ── Resolve which tenant this lead belongs to ────────────────────────────
    // Each tenant's WordPress site should post to `?secret=...&tenant=<slug>`.
    // Falls back to 'samara' when omitted, so existing form configs keep working.
    // Resolved before the secret check below, since the secret itself is per-tenant.
    const tenantSlug = request.nextUrl.searchParams.get('tenant')
    const resolved = await resolveTenantBySlugFull(tenantSlug)
    if (!resolved) return json({ error: 'Unknown or inactive tenant' }, 400)
    const { db, tenant } = resolved

    // ── Verify secret token ──────────────────────────────────────────────────
    const secret   = request.nextUrl.searchParams.get('secret')
    const expected = await getTenantSecret(tenant.id, 'cf7WebhookSecret')
    if (!expected || secret !== expected) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Parse body (JSON or form-encoded) ────────────────────────────────────
    const contentType = request.headers.get('content-type') ?? ''
    let data: Record<string, unknown> = {}

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

    // ── Extract fields ────────────────────────────────────────────────────────
    const firstName = pick(data, 'first-name', 'first_name', 'firstName', 'your-first-name')
    const lastName  = pick(data, 'last-name',  'last_name',  'lastName',  'your-last-name')
    const email     = pick(data, 'email',       'your-email', 'Email')
    const phone     = pick(data, 'phone',       'phone-wa',   'phone_wa',  'your-phone', 'Phone')
    const numGuests = pick(data, 'number-of-guests', 'num-guests', 'number_of_guests', 'guests', 'guest-count')
    const checkIn   = pick(data, 'check-in-date',  'checkin',  'check_in',  'start-date', 'check-in')
    const checkOut  = pick(data, 'check-out-date', 'checkout', 'check_out', 'end-date',   'check-out')
    const tripType  = pick(data, 'trip-type',  'trip_type',  'tripType',  'trip')
    const message   = pick(data, 'request',    'message',    'your-message', 'Request', 'Message')
    // UTM fields — the WordPress form doesn't send these yet as of this writing, but
    // capturing them defensively costs nothing and this starts working the moment
    // hidden utm_* fields are added there, with no backend change needed.
    const utmSource   = pick(data, 'utm_source',   'utm-source')
    const utmMedium   = pick(data, 'utm_medium',   'utm-medium')
    const utmCampaign = pick(data, 'utm_campaign', 'utm-campaign')
    const utmTerm     = pick(data, 'utm_term',     'utm-term')
    const utmContent  = pick(data, 'utm_content',  'utm-content')
    const url = pick(data, 'page-url', 'page_url', 'url', 'form-url')
    const website = (() => { try { return url ? new URL(url).hostname : '' } catch { return '' } })()

    if (!firstName && !email && !phone) {
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
        utmSource:    utmSource   || null,
        utmMedium:    utmMedium   || null,
        utmCampaign:  utmCampaign || null,
        utmTerm:      utmTerm     || null,
        utmContent:   utmContent  || null,
        rawPayload:   toJsonSafe(data),
      },
    })

    logActivity({
      userId: '', userName: 'Website CF7', userRole: 'SYSTEM',
      action: 'CREATE', entity: ownerType === 'customer' ? 'Customer' : 'Lead', entityId: ownerId,
      detail: `Website inquiry: ${fullName}${message ? ` · ${message}` : ''}`,
    }, db).catch(() => {})

    return json({ ok: true, ownerType, ownerId })
  } catch (error) {
    console.error('[CF7 webhook]', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
