import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/geo-country'
import { exceedsRateLimit } from '@/lib/rate-limit'
import { resolveTenantBySlugFull } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { isHttpUrl } from '@/lib/url-safety'
import { logWebhookFailure } from '@/lib/webhook-log'
import { providedWebhookSecret, webhookSecretMatches } from '@/lib/webhook-secret'

// Called from the client-side tracker on every page load of the tenant's
// website (not just on form submit), so it's public + CORS-open and its
// ?secret= is visible in page source by design. That's why it has its own
// low-value pageviewWebhookSecret, separate from the cf7 (lead) secret — the
// cf7 secret is never accepted here, so it can't leak via the tracker.
// Since the secret is public anyway, the real guards against junk pageviews
// are the per-IP rate limit and the pageviewAllowedDomains check below.
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

  // Before any DB work, so a flood (or secret guessing) costs us nothing. Not logged — it
  // would just turn the flood into log spam.
  if (exceedsRateLimit(`pageview:${rawTenantSlug}:${getClientIp(request) ?? 'unknown'}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
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

    const visitorId = typeof data.visitorId === 'string' ? data.visitorId.trim() : ''
    const rawUrl    = typeof data.url === 'string' ? data.url.trim() : ''
    if (!visitorId || !isHttpUrl(rawUrl)) {
      return json({ error: 'Missing visitorId or url' }, 400)
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
      const d = new Date(typeof data.occurredAt === 'string' ? data.occurredAt : '')
      return isNaN(d.getTime()) ? new Date() : d
    })()

    await db.pageView.create({
      data: {
        visitorId,
        url:        rawUrl,
        referrer:   isHttpUrl(rawReferrer) ? rawReferrer : null,
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
