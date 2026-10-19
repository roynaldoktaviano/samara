import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/geo-country'
import { exceedsRateLimit } from '@/lib/rate-limit'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'
import { providedWebhookSecret, webhookSecretMatches } from '@/lib/webhook-secret'

// Normally called server-to-server by the tenant's WordPress site: the browser
// beacons each page load to the site's own /wp-json/samara/v1/pv, and WordPress
// forwards it here with the secret in the X-Webhook-Secret header plus the
// visitor's IP as visitor_ip — so the secret never reaches page source or a URL.
// Its own pageviewWebhookSecret, separate from the cf7 (lead) secret, which is
// never accepted here.
// LEGACY (remove once every site runs the server-side snippet and the secret is
// rotated): the old browser tracker posts here directly, CORS-open, with
// ?secret= in the URL.
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

// A real visitor loads a few pages a minute at most; 120 per 10 min per IP leaves
// room for an office/hotel sharing one IP while still capping a script.
const RATE_LIMIT_MAX = 120
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
// Server-forwarded calls all come from the WordPress server's IP, so the pre-auth
// cap per caller IP is much higher; the per-visitor cap applies after auth instead.
const SERVER_RATE_LIMIT_MAX = 20_000

const MAX_URL_LENGTH = 2000
// samara_vid cookie is a UUID; allow a little slack for other trackers' ids.
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
// A page view is reported as it happens — anything far off is forged or a broken clock.
const MAX_PAST_MS = 60 * 60 * 1000
const MAX_FUTURE_MS = 5 * 60 * 1000

/** "https://www.Example.com/x, otiumyacht.com" → ["example.com", "otiumyacht.com"] */
function parseAllowedDomains(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',')
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .filter(Boolean)
}

function hostAllowed(urlOrOrigin: string, allowed: string[]): boolean {
  try {
    const host = new URL(urlOrOrigin).hostname.toLowerCase()
    return allowed.some(d => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const rawTenantSlug = request.nextUrl.searchParams.get('tenant')

  const fromServer = !!request.headers.get('x-webhook-secret')
  const callerIp = getClientIp(request) ?? 'unknown'

  // Before any DB work, so a flood (or secret guessing) costs us nothing. Not logged — it
  // would just turn the flood into log spam.
  if (exceedsRateLimit(
    `pageview:${fromServer ? 'srv' : 'web'}:${rawTenantSlug}:${callerIp}`,
    fromServer ? SERVER_RATE_LIMIT_MAX : RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  )) {
    return json({ error: 'Too many requests' }, 429)
  }

  let data: Record<string, unknown> = {}
  try {
    data = await request.json()
  } catch { /* leave empty — validated below */ }

  try {
    const resolved = await resolveTenantBySlugFull(rawTenantSlug)
    if (!resolved) {
      logWebhookFailure({ source: 'PageView', tenantSlug: rawTenantSlug, reason: 'unknown_tenant' })
      return json({ error: 'Unknown or inactive tenant' }, 400)
    }
    const { db, tenant } = resolved

    const expected = await getTenantSecret(tenant.id, 'pageviewWebhookSecret')
    if (!webhookSecretMatches(providedWebhookSecret(request, { allowQueryParam: true }), expected)) {
      logWebhookFailure({ source: 'PageView', tenantSlug: tenant.slug, reason: 'unauthorized' })
      return json({ error: 'Unauthorized' }, 401)
    }

    // Per real visitor: WordPress forwards the visitor's IP (trusted only now that the
    // secret has matched); a direct browser call is already capped per caller IP above.
    const visitorIp = typeof data.visitor_ip === 'string' ? data.visitor_ip.trim().slice(0, 64) : ''
    if (fromServer && visitorIp && exceedsRateLimit(`pageview:visitor:${tenant.slug}:${visitorIp}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return json({ error: 'Too many requests' }, 429)
    }

    const visitorId = typeof data.visitorId === 'string' ? data.visitorId.trim() : ''
    const rawUrl    = typeof data.url === 'string' ? data.url.trim() : ''
    if (!VISITOR_ID_RE.test(visitorId) || rawUrl.length > MAX_URL_LENGTH || !isHttpUrl(rawUrl)) {
      return json({ error: 'Invalid visitorId or url' }, 400)
    }

    // Both the reported page URL and the browser's Origin (when sent) must be one of the
    // tenant's own sites — stops other websites, or hand-made requests with made-up URLs,
    // from filling the visitor journey. Origin can be forged outside a browser; the rate
    // limit above is what caps that.
    const allowedDomains = parseAllowedDomains(await getTenantSecret(tenant.id, 'pageviewAllowedDomains'))
    if (allowedDomains.length > 0) {
      const origin = request.headers.get('origin')
      if (!hostAllowed(rawUrl, allowedDomains) || (origin && !hostAllowed(origin, allowedDomains))) {
        logWebhookFailure({ source: 'PageView', tenantSlug: tenant.slug, reason: 'domain_not_allowed', detail: `url=${rawUrl.slice(0, 200)} origin=${origin ?? '-'}` })
        return json({ error: 'Domain not allowed' }, 403)
      }
    }

    const rawReferrer = typeof data.referrer === 'string' ? data.referrer.trim() : ''
    const title        = typeof data.title === 'string' ? data.title.trim().slice(0, 300) : ''
    const occurredAt   = (() => {
      const now = Date.now()
      const t = new Date(typeof data.occurredAt === 'string' ? data.occurredAt : '').getTime()
      return isNaN(t) || t < now - MAX_PAST_MS || t > now + MAX_FUTURE_MS ? new Date(now) : new Date(t)
    })()

    await db.pageView.create({
      data: {
        visitorId,
        url:        rawUrl,
        referrer:   rawReferrer.length <= MAX_URL_LENGTH && isHttpUrl(rawReferrer) ? rawReferrer : null,
        title:      title || null,
        occurredAt,
      },
    })

    return json({ ok: true })
  } catch (error) {
    logWebhookFailure({ source: 'PageView', tenantSlug: rawTenantSlug, reason: 'exception', detail: String(error) })
    console.error('[pageview webhook]', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
